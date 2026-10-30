package com.slimora.game;

import android.app.Activity;

import com.gaa.sdk.iap.AcknowledgeParams;
import com.gaa.sdk.iap.ConsumeParams;
import com.gaa.sdk.iap.IapResult;
import com.gaa.sdk.iap.ProductDetail;
import com.gaa.sdk.iap.ProductDetailsParams;
import com.gaa.sdk.iap.PurchaseClient;
import com.gaa.sdk.iap.PurchaseClientStateListener;
import com.gaa.sdk.iap.PurchaseData;
import com.gaa.sdk.iap.PurchaseFlowParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 원스토어 인앱결제 SDK V21 다리. 지급 판단은 웹(게임) 쪽이 하고, 여기서는 결제창 · 조회 · 소비/확인만 한다.
 * 결제 후 3일 안에 소비(consume) 또는 확인(acknowledge)하지 않으면 원스토어가 자동 환불한다
 */
@CapacitorPlugin(name = "OneStoreBilling")
public class OneStoreBillingPlugin extends Plugin {

    private PurchaseClient client;
    private PluginCall purchaseCall;
    /** finish 에 쓸 원본. 결제 · 조회 때 받아 둔다 (purchaseToken → PurchaseData) */
    private final Map<String, PurchaseData> known = new HashMap<>();

    @Override
    public void load() {
        // 라이선스 키(개발자센터 → 앱 → 라이선스 관리)가 비어 있으면 결제를 끈다
        String key = getContext().getString(R.string.onestore_license_key).trim();
        if (key.isEmpty()) return;
        client = PurchaseClient.newBuilder(getContext())
            .setBase64PublicKey(key)
            .setListener(this::onPurchasesUpdated)
            .build();
    }

    @Override
    protected void handleOnDestroy() {
        if (client != null) client.endConnection();
    }

    @PluginMethod
    public void prices(PluginCall call) {
        List<String> skus;
        try {
            skus = call.getArray("skus", new JSArray()).toList();
        } catch (JSONException e) {
            call.reject("skus 형식 오류");
            return;
        }
        ProductDetailsParams params = ProductDetailsParams.newBuilder()
            .setProductIdList(skus)
            .setProductType(PurchaseClient.ProductType.INAPP)
            .build();
        withClient(call, () -> client.queryProductDetailsAsync(params, (result, details) -> {
            if (!result.isSuccess()) {
                fail(call, result);
                return;
            }
            JSObject prices = new JSObject();
            if (details != null) for (ProductDetail d : details) prices.put(d.getProductId(), formatPrice(d.getPrice()));
            JSObject out = new JSObject();
            out.put("prices", prices);
            call.resolve(out);
        }));
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String sku = call.getString("sku");
        if (sku == null) {
            call.reject("sku 가 없습니다");
            return;
        }
        if (purchaseCall != null) {
            call.reject("이미 결제가 진행 중입니다", "BUSY");
            return;
        }
        withClient(call, () -> {
            purchaseCall = call;
            PurchaseFlowParams params = PurchaseFlowParams.newBuilder()
                .setProductId(sku)
                .setProductType(PurchaseClient.ProductType.INAPP)
                .build();
            IapResult started = client.launchPurchaseFlow(getActivity(), params);
            if (started != null && !started.isSuccess()) onPurchasesUpdated(started, null);
        });
    }

    /** 지급을 마친 주문을 닫는다. consume = 소비, 아니면 확인만 (영구 상품 — 재설치 뒤 pending 으로 복원) */
    @PluginMethod
    public void finish(PluginCall call) {
        String token = call.getString("purchaseToken");
        PurchaseData data = token == null ? null : known.get(token);
        if (data == null) {
            call.reject("모르는 주문입니다", "UNKNOWN_PURCHASE");
            return;
        }
        boolean consume = Boolean.TRUE.equals(call.getBoolean("consume", false));
        withClient(call, () -> {
            if (consume) {
                client.consumeAsync(ConsumeParams.newBuilder().setPurchaseData(data).build(), (result, p) -> finished(call, token, result));
            } else {
                client.acknowledgeAsync(AcknowledgeParams.newBuilder().setPurchaseData(data).build(), (result, p) -> finished(call, token, result));
            }
        });
    }

    /** 소비되지 않은 구매 (미지급 주문 · 확인을 마친 1회 한정 상품) */
    @PluginMethod
    public void pending(PluginCall call) {
        withClient(call, () -> client.queryPurchasesAsync(PurchaseClient.ProductType.INAPP, (result, purchases) -> {
            if (!result.isSuccess()) {
                fail(call, result);
                return;
            }
            JSObject out = new JSObject();
            out.put("purchases", toJs(purchases));
            call.resolve(out);
        }));
    }

    private void onPurchasesUpdated(IapResult result, List<PurchaseData> purchases) {
        PluginCall call = purchaseCall;
        if (call == null) return;
        if (result.getResponseCode() == PurchaseClient.ResponseCode.RESULT_NEED_LOGIN) {
            // 로그인 뒤에 결제창을 다시 띄운다
            purchaseCall = null;
            login(call, () -> purchase(call));
            return;
        }
        purchaseCall = null;
        JSObject out = new JSObject();
        out.put("code", result.getResponseCode());
        out.put("purchases", toJs(result.isSuccess() ? purchases : null));
        call.resolve(out);
    }

    private void finished(PluginCall call, String token, IapResult result) {
        if (!result.isSuccess()) {
            fail(call, result);
            return;
        }
        known.remove(token);
        call.resolve();
    }

    /** 연결돼 있지 않으면 연결부터. 원스토어 로그인 · 업데이트가 필요하면 그 화면을 띄운다 */
    private void withClient(PluginCall call, Runnable action) {
        if (client == null) {
            call.reject("원스토어 라이선스 키가 없습니다", "NO_LICENSE_KEY");
            return;
        }
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (client.isReady()) {
                action.run();
                return;
            }
            client.startConnection(new PurchaseClientStateListener() {
                @Override
                public void onSetupFinished(IapResult result) {
                    int code = result.getResponseCode();
                    if (result.isSuccess()) action.run();
                    else if (code == PurchaseClient.ResponseCode.RESULT_NEED_LOGIN) login(call, () -> withClient(call, action));
                    else if (code == PurchaseClient.ResponseCode.RESULT_NEED_UPDATE) update(call);
                    else fail(call, result);
                }

                @Override
                public void onServiceDisconnected() {
                    // 다음 호출 때 다시 연결한다
                }
            });
        });
    }

    private void login(PluginCall call, Runnable then) {
        getActivity().runOnUiThread(() -> client.launchLoginFlowAsync(getActivity(), (result) -> {
            if (result.isSuccess()) then.run();
            else fail(call, result);
        }));
    }

    /** 원스토어 서비스를 설치 · 업데이트한다. 끝나면 사용자가 다시 시도한다 */
    private void update(PluginCall call) {
        client.launchUpdateOrInstallFlow(getActivity(), (result) -> fail(call, result));
    }

    private void fail(PluginCall call, IapResult result) {
        JSObject data = new JSObject();
        data.put("code", result.getResponseCode());
        call.reject(result.getMessage(), String.valueOf(result.getResponseCode()), data);
    }

    private JSArray toJs(List<PurchaseData> purchases) {
        JSArray list = new JSArray();
        if (purchases == null) return list;
        for (PurchaseData p : purchases) {
            if (p.getPurchaseState() != PurchaseData.PurchaseState.PURCHASED) continue;
            known.put(p.getPurchaseToken(), p);
            JSObject o = new JSObject();
            o.put("orderId", p.getOrderId());
            o.put("sku", p.getProductId());
            o.put("purchaseToken", p.getPurchaseToken());
            o.put("acknowledged", p.isAcknowledged());
            list.put(o);
        }
        return list;
    }

    /** 원스토어는 가격을 숫자 문자열("1100")로 준다 → "1,100원" */
    private static String formatPrice(String price) {
        try {
            return String.format(java.util.Locale.KOREA, "%,d원", Long.parseLong(price.trim()));
        } catch (RuntimeException e) {
            return price;
        }
    }
}

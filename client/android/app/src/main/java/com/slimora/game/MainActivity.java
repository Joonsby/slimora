package com.slimora.game;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 앱 모듈 안의 플러그인은 super.onCreate 전에 등록해야 한다
        registerPlugin(OneStoreBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

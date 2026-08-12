package com.youshi.cultivation;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeSystemUiPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

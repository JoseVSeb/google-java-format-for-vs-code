import * as assert from "assert";
import { GoogleJavaFormatConfiguration } from "../../ExtensionConfiguration";

suite("ExtensionConfiguration SSL Test Suite", () => {
    test("Should include strictSSL property in configuration interface", () => {
        // Test that the configuration object can handle the strictSSL property
        const config: GoogleJavaFormatConfiguration = {
            version: "latest",
            mode: "native-binary",
            strictSSL: false,
        };

        assert.strictEqual(config.strictSSL, false, "strictSSL should be false when set");
        
        const configWithStrictSSL: GoogleJavaFormatConfiguration = {
            version: "1.17.0",
            mode: "jar-file", 
            strictSSL: true,
        };

        assert.strictEqual(configWithStrictSSL.strictSSL, true, "strictSSL should be true when set");
    });

    test("Should handle undefined strictSSL gracefully", () => {
        const config: GoogleJavaFormatConfiguration = {
            version: "latest",
            mode: "native-binary",
        };

        // strictSSL should be undefined when not set
        assert.strictEqual(config.strictSSL, undefined, "strictSSL should be undefined when not set");
        
        // Default behavior should be strict SSL (true)
        const effectiveStrictSSL = config.strictSSL ?? true;
        assert.strictEqual(effectiveStrictSSL, true, "Default behavior should be strict SSL");
    });
});
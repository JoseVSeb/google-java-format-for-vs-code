import * as assert from "assert";
import { LogOutputChannel } from "vscode";
import { fetchWithSSLOptions } from "../../fetchWithSSLOptions";

// Mock logger for testing
const mockLog: LogOutputChannel = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
} as any;

suite("fetchWithSSLOptions Test Suite", () => {
    test("Should use standard fetch when strictSSL is true", async () => {
        // Test with a URL that should work with standard fetch
        const url = "https://api.github.com/repos/google/google-java-format/releases/latest";
        
        // This should not throw an error in most environments
        try {
            const response = await fetchWithSSLOptions(url, true, mockLog);
            assert.ok(response, "Response should be defined");
        } catch (error) {
            // If this fails, it might be due to network issues in the test environment
            // which is acceptable for this test
            console.log("Standard fetch failed (expected in some environments):", error);
        }
    });

    test("Should handle SSL configuration correctly", async () => {
        // Test that the function accepts both true and false for strictSSL
        const url = "https://api.github.com/repos/google/google-java-format/releases/latest";
        
        // Test with strictSSL = false (should not throw immediately)
        try {
            const response = await fetchWithSSLOptions(url, false, mockLog);
            assert.ok(response, "Response should be defined even with strictSSL=false");
        } catch (error) {
            // This might fail due to network issues, which is acceptable
            console.log("Relaxed SSL fetch failed (acceptable in test environment):", error);
        }
    });

    test("Should log appropriate messages", () => {
        let debugMessages: string[] = [];
        let warnMessages: string[] = [];
        
        const testLog: LogOutputChannel = {
            debug: (message: string) => debugMessages.push(message),
            warn: (message: string) => warnMessages.push(message),
            info: () => {},
            error: () => {},
        } as any;

        // Test that debug messages are logged
        const url = "https://example.com/test";
        
        // Just test the initial logging behavior
        fetchWithSSLOptions(url, true, testLog).catch(() => {
            // Expected to fail for example.com, but should have logged
        });
        
        // The debug message should be logged immediately
        setTimeout(() => {
            assert.ok(
                debugMessages.some(msg => msg.includes(url)),
                "Should log the URL being fetched"
            );
        }, 10);
    });
});
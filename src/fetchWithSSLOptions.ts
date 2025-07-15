import { Agent } from "https";
import { LogOutputChannel } from "vscode";

/**
 * Custom fetch function that handles SSL certificate issues in corporate proxy environments.
 * This function respects the strictSSL configuration option and provides fallback behavior
 * for environments where SSL certificates cannot be properly validated.
 */
export async function fetchWithSSLOptions(
    url: string,
    strictSSL: boolean,
    log: LogOutputChannel,
): Promise<Response> {
    log.debug(`Fetching: ${url} (strictSSL: ${strictSSL})`);

    if (strictSSL) {
        // Use standard fetch with full SSL verification (default behavior)
        return fetch(url);
    }

    // For corporate proxy environments, create a custom HTTPS agent that allows
    // self-signed certificates or certificate validation issues
    try {
        // First try with standard fetch
        const response = await fetch(url);
        log.debug("Standard fetch succeeded");
        return response;
    } catch (error) {
        log.warn(
            `Standard fetch failed: ${error}. Retrying with relaxed SSL verification.`,
        );

        // If standard fetch fails, try with relaxed SSL verification
        // This uses Node.js-specific options that are not available in all environments
        try {
            const httpsAgent = new Agent({
                rejectUnauthorized: false,
            });

            // Use fetch with custom agent for HTTPS URLs
            if (url.startsWith("https://")) {
                const response = await fetch(url, {
                    // @ts-ignore - Node.js specific option
                    agent: httpsAgent,
                });
                log.debug("Fetch with relaxed SSL verification succeeded");
                return response;
            }

            // For non-HTTPS URLs, use standard fetch
            return fetch(url);
        } catch (relaxedError) {
            log.error(
                `Both standard and relaxed SSL fetch failed: ${relaxedError}`,
            );
            throw relaxedError;
        }
    }
}
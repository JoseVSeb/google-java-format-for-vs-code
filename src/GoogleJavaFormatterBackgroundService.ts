import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { createServer, Server } from "net";
import { LogOutputChannel, window } from "vscode";
import { IGoogleJavaFormatter } from "./IGoogleJavaFormatter";

// TODO: Create a simple java project to run as background service.
// TODO: Load google java format executable jar from file or url.
// TODO: Provided wrapper API for formatting code.
export default class GoogleJavaFormatterBackgroundService
    implements IGoogleJavaFormatter
{
    service: ChildProcessWithoutNullStreams | null = null;
    server: Server | null = null;

    constructor(
        private executable: string,
        private port: number,
        private log: LogOutputChannel,
    ) {}

    // Start the background service on the specified port
    private startService(): Promise<number> {
        return Promise.reject(new Error("Background service not implemented."));

        return new Promise<number>((resolve, reject) => {
            this.service = spawn("java", [
                "-jar",
                this.executable,
                "-s",
                "--port",
                `${this.port}`,
            ]);

            this.service.on("error", reject);
            this.service.on("exit", (code, signal) => {
                reject(
                    new Error(
                        `Service exited with code ${code} and signal ${signal}`,
                    ),
                );
            });

            // Wait for the service to start and return the actual port number it is using
            this.service.stdout.on("data", (data) => {
                const match = data.toString().match(/Listening on port (\d+)/);
                if (match) {
                    resolve(parseInt(match[1]));
                }
            });
        });
    }

    public init() {
        this.log.debug(
            "Initializing background service for google java format.",
        );

        // Create a server to listen on the random port used by the service
        this.server = createServer((socket) => {
            socket.end("HTTP/1.1 200 OK\r\n\r\n");
        });

        this.server.listen(this.port, () => {
            this.startService()
                .then((actualPort) => {
                    this.log.info(`Service started on port ${actualPort}`);
                })
                .catch((error) => {
                    this.log.error(`Failed to start service: ${error}`);
                    window.showErrorMessage(
                        `Failed to start service: ${error}`,
                    );
                });
        });
        // this.server.unref();
    }

    public dispose() {
        this.service?.kill();
        this.server?.close();
    }

    public format(text: string): Promise<string> {
        throw new Error("Method not implemented.");
    }
}

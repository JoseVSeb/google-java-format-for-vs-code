import { window } from "vscode";

export enum LogLevel {
    none,
    error,
    warn,
    info,
    debug,
}

export interface ILogService {
    debug(message: string, data?: unknown): void;
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, error?: unknown): void;
}

export default class LogService implements ILogService {
    private outputChannel = window.createOutputChannel(
        "Google Java Format for VS Code",
    );

    public logLevel: LogLevel = LogLevel.info;

    debug(message: string, data?: unknown): void {
        this.logMessage(message, data);
    }
    info(message: string, data?: unknown): void {
        this.logMessage(message, data);
    }
    warn(message: string, data?: unknown): void {
        this.logMessage(message, data);
    }
    error(message: string, error?: unknown): void {
        this.logMessage(message, error);
    }

    private logObject(data: unknown): void {
        const message = JSON.stringify(data, null, 2);

        this.outputChannel.appendLine(message);
    }

    /**
     * Append messages to the output channel and format it with a title
     *
     * @param message The message to append to the output channel
     */
    private logMessage(message: string, data?: unknown): void {
        const title = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(
            `["${LogLevel[this.logLevel]}" - ${title}] ${message}`,
        );
        if (data) {
            this.logObject(data);
        }
    }
}

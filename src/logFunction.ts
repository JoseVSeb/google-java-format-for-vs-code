import { LogOutputChannel } from "vscode";

export function logFunction<Args extends unknown[], R>(
    fn: (log: LogOutputChannel, ...args: Args) => R,
) {
    return function (log: LogOutputChannel, ...args: Args) {
        log.debug(
            `Calling ${`"${fn.name}"` || "anonymous function"} with arguments:`,
            args,
        );
        try {
            const result = fn(log, ...args);
            log.debug(
                `${`"${fn.name}"` || "anonymous function"} returned:`,
                result,
            );
            return result;
        } catch (error) {
            log.error(
                `Error in ${`"${fn.name}"` || "anonymous function"}:`,
                error,
            );
            throw error;
        }
    };
}

export function logAsyncFunction<Args extends unknown[], R>(
    fn: (log: LogOutputChannel, ...args: Args) => Promise<R>,
) {
    return async function (log: LogOutputChannel, ...args: Args) {
        log.debug(
            `Calling ${`"${fn.name}"` || "anonymous function"} with arguments:`,
            args,
        );
        try {
            const result = await fn(log, ...args);
            log.debug(
                `${`"${fn.name}"` || "anonymous function"} returned:`,
                result,
            );
            return result;
        } catch (error) {
            log.error(
                `Error in ${`"${fn.name}"` || "anonymous function"}:`,
                error,
            );
            throw error;
        }
    };
}

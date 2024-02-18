/* eslint-disable @typescript-eslint/naming-convention */
export type GoogleJavaFormatReleaseResponse = {
    tag_name: string;
    assets: {
        browser_download_url: string;
    }[];
};

// FIXME: Only valid combinations should be here.
type System = `${NodeJS.Platform}-${NodeJS.Architecture}`;

export const parseGoogleJavaFormatReleaseResponse = ({
    tag_name: tag,
    assets: arr,
}: GoogleJavaFormatReleaseResponse) => {
    const assets = arr.reduce((map, { browser_download_url: url }) => {
        if (url.endsWith("all-deps.jar")) {
            map.set("java", url);
        } else if (url.endsWith("darwin-arm64")) {
            map.set("darwin-arm64", url);
        } else if (url.endsWith("linux-x86-64")) {
            map.set("linux-x64", url);
        } else if (url.endsWith("windows-x86-64.exe")) {
            map.set("win32-x64", url);
        }
        return map;
    }, new Map<System | "java", string>());

    return { tag, assets };
};

export type GoogleJavaFormatRelease = ReturnType<
    typeof parseGoogleJavaFormatReleaseResponse
>;

import fetch from "node-fetch";

export type Version = {
    major: number;
    minor: number;
    patch: number;
};

export const getListOfGoogleJavaFormatVersions = async () => {
    const response = await fetch(
        `https://api.github.com/repos/google/google-java-format/tags`,
    );
    if (!response.ok) {
        throw new Error(
            "Failed to retrieve list of google java format versions",
        );
    }

    const tags = (await response.json()) as { name: string }[];
    const versions = tags.reduce<Version[]>((acc, { name }) => {
        const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(name);

        if (match) {
            const [, major, minor, patch] = match;
            acc.push({
                major: parseInt(major),
                minor: parseInt(minor),
                patch: parseInt(patch),
            });
        }

        return acc;
    }, []);

    return versions.sort((a, b) => {
        if (a.major !== b.major) {
            return b.major - a.major;
        }
        if (a.minor !== b.minor) {
            return b.minor - a.minor;
        }
        return b.patch - a.patch;
    });
};

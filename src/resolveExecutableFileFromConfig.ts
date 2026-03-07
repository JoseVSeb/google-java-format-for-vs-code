import type { ExtensionContext, LogOutputChannel } from "vscode";
import { Uri } from "vscode";
import type { ExtensionConfiguration } from "./ExtensionConfiguration";
import { GoogleJavaFormatService } from "./GoogleJavaFormatService";

function getUrlStateKey({
  version,
  mode,
  system,
}: {
  version: string;
  mode: string;
  system: string;
}) {
  return `resolvedUrl:${version}:${mode}:${system}`;
}

export async function resolveExecutableFileFromConfig(
  { executable, mode, version }: ExtensionConfiguration,
  log: LogOutputChannel,
  context?: ExtensionContext,
): Promise<Uri> {
  const service = new GoogleJavaFormatService(log);

  if (executable) {
    log.debug(`Using config key 'executable': ${executable}`);
    return service.getUriFromString(executable);
  }

  const shouldCheckNativeBinary = mode === "native-binary";
  const system = `${process.platform}-${process.arch}` as const;
  if (shouldCheckNativeBinary) {
    log.debug(`Using native binary for ${system} if available`);
  }

  if (version === "latest") {
    log.debug(`Using latest version...`);
  }

  const stateKey = getUrlStateKey({
    version: version ?? "latest",
    mode: mode ?? "jar-file",
    system,
  });

  try {
    const { assets } =
      version && version !== "latest"
        ? await service.getReleaseByVersion(version)
        : await service.getLatestRelease();

    const url = (shouldCheckNativeBinary && assets.get(system)) || assets.get("java")!;
    log.debug(`Using url: ${url}`);

    if (context) {
      await context.globalState.update(stateKey, url);
    }

    return Uri.parse(url);
  } catch (error) {
    const cachedUrl = context?.globalState.get<string>(stateKey);
    if (cachedUrl) {
      log.warn(`Network unavailable, falling back to last known url: ${cachedUrl}`);
      return Uri.parse(cachedUrl);
    }
    throw error;
  }
}

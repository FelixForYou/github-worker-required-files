'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeJava(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ');
}

function validPackageName(value) {
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(String(value || '').trim());
}

async function copyDir(source, destination) {
  await fsp.cp(source, destination, {
    recursive: true,
    force: true,
    filter: (src) => {
      const rel = path.relative(source, src).replace(/\\/g, '/');
      return rel !== '.gradle' && !rel.startsWith('.gradle/') && rel !== 'build' && !rel.startsWith('build/');
    }
  });
}

async function main() {
  const payloadRaw = process.env.BUILD_PAYLOAD || '{}';
  const payload = JSON.parse(payloadRaw);
  const repoRoot = path.resolve(__dirname, '..', '..');
  const source = path.join(repoRoot, 'assets', 'android-native-template-safe');
  const destination = path.join(repoRoot, '.github-build', 'android-project');

  await fsp.rm(destination, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await copyDir(source, destination);

  const appName = String(payload.appName || 'Web2Apk App');
  const targetUrl = String(payload.url || 'https://google.com');
  const encodedUrl = Buffer.from(targetUrl, 'utf8').toString('base64');

  const stringsPath = path.join(destination, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
  let strings = await fsp.readFile(stringsPath, 'utf8');
  strings = strings.replace(/<string name="app_name">.*<\/string>/, `<string name="app_name">${escapeXml(appName)}</string>`);
  await fsp.writeFile(stringsPath, strings, 'utf8');

  const activityPath = path.join(destination, 'app', 'src', 'main', 'java', 'com', 'web2apk', 'app', 'MainActivity.java');
  let activity = await fsp.readFile(activityPath, 'utf8');
  activity = activity.replace(/ENCODED_URL_PLACEHOLDER/g, encodedUrl);
  activity = activity.replace(
    /private static final String FALLBACK_URL = ".*";/,
    `private static final String FALLBACK_URL = "${escapeJava(targetUrl)}";`
  );
  activity = activity.replace(/https:\/\/google\.com/g, escapeJava(targetUrl));
  await fsp.writeFile(activityPath, activity, 'utf8');

  if (validPackageName(payload.packageName)) {
    const gradlePath = path.join(destination, 'app', 'build.gradle');
    let gradle = await fsp.readFile(gradlePath, 'utf8');
    gradle = gradle.replace(/applicationId\s+"[^"]*"/, `applicationId "${String(payload.packageName).trim()}"`);
    await fsp.writeFile(gradlePath, gradle, 'utf8');
  }

  if (payload.themeColor && /^#[0-9a-fA-F]{6}$/.test(String(payload.themeColor))) {
    const colorsPath = path.join(destination, 'app', 'src', 'main', 'res', 'values', 'colors.xml');
    let colors = await fsp.readFile(colorsPath, 'utf8');
    colors = colors.replace(/(<color name="colorPrimary">)[^<]*(<\/color>)/, `$1${payload.themeColor}$2`);
    colors = colors.replace(/(<color name="colorPrimaryDark">)[^<]*(<\/color>)/, `$1${payload.themeColor}$2`);
    await fsp.writeFile(colorsPath, colors, 'utf8');
  }

  await fsp.chmod(path.join(destination, 'gradlew'), 0o755).catch(() => {});

  if (payload.customIcon) {
    console.warn('Custom icon file_id belum dapat diambil oleh GitHub runner; template icon dipakai.');
  }

  console.log(destination);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

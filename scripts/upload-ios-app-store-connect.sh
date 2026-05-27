#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ASC_KEY_ID="${ASC_KEY_ID:-39U86MT428}"
ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-DUAVU4QD7P}"
ARCHIVE_PATH="${ARCHIVE_PATH:-$ROOT_DIR/build/ios/App.xcarchive}"
EXPORT_PATH="${EXPORT_PATH:-$ROOT_DIR/build/ios/export}"
EXPORT_OPTIONS="${EXPORT_OPTIONS:-$ROOT_DIR/ios/ExportOptions-AppStoreConnect.plist}"

if [[ -z "${ASC_ISSUER_ID:-}" ]]; then
  echo "Missing ASC_ISSUER_ID. Set it to the Issuer ID from App Store Connect > Users and Access > Integrations." >&2
  exit 2
fi

if [[ ! -f "$ASC_KEY_PATH" ]]; then
  echo "Missing App Store Connect key at $ASC_KEY_PATH" >&2
  exit 2
fi

npm run cap:sync:ios

rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH"
mkdir -p "$(dirname "$ARCHIVE_PATH")" "$EXPORT_PATH"

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  clean archive

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

IPA_PATH="$(find "$EXPORT_PATH" -maxdepth 1 -name '*.ipa' -print -quit)"
if [[ -z "$IPA_PATH" ]]; then
  echo "No IPA was exported to $EXPORT_PATH" >&2
  exit 1
fi

xcrun altool \
  --upload-package "$IPA_PATH" \
  --api-key "$ASC_KEY_ID" \
  --api-issuer "$ASC_ISSUER_ID" \
  --wait

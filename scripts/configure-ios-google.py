"""Configure public Google iOS OAuth metadata; preserve signing and unrelated URL handlers."""
import argparse
import plistlib
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--client-id', help='OAuth client ID of type iOS, for the installed app bundle ID')
parser.add_argument('--check', action='store_true', help='Validate existing configuration without editing')
args = parser.parse_args()
if bool(args.client_id) == args.check:
    parser.error('Choose --client-id YOUR_IOS_CLIENT_ID or --check')
path = Path(__file__).resolve().parents[1] / 'ios/App/App/Info.plist'
with path.open('rb') as file:
    info = plistlib.load(file)
client_id = args.client_id or info.get('GIDClientID', '')
if not re.fullmatch(r'[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com', client_id):
    parser.error('A valid iOS OAuth client ID is required. Create it in Google Cloud for the exact TestFlight bundle ID.')
scheme = '.'.join(reversed(client_id.split('.')))
if args.check:
    if not any(scheme in entry.get('CFBundleURLSchemes', []) for entry in info.get('CFBundleURLTypes', [])):
        parser.error('Google callback scheme is missing. Run with --client-id to configure it.')
else:
    old_id = info.get('GIDClientID', '')
    old_scheme = '.'.join(reversed(old_id.split('.'))) if old_id else None
    types = []
    for entry in info.get('CFBundleURLTypes', []):
        if entry.get('CFBundleURLName') == 'DivvyGoogleSignIn':
            continue
        if old_scheme:
            entry['CFBundleURLSchemes'] = [s for s in entry.get('CFBundleURLSchemes', []) if s != old_scheme]
        types.append(entry)
    types.append({'CFBundleURLName': 'DivvyGoogleSignIn', 'CFBundleURLSchemes': [scheme]})
    info['GIDClientID'] = client_id
    info['CFBundleURLTypes'] = types
    with path.open('wb') as file:
        plistlib.dump(info, file, sort_keys=False)
print('Google iOS client and callback scheme are configured. Confirm its Google Cloud bundle ID matches your signed TestFlight app.')

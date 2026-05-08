#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_file="$script_dir/extension/extension.mjs"
destination_dir="$HOME/.copilot/extensions/cost-meter"
destination_file="$destination_dir/extension.mjs"

if [ ! -f "$source_file" ]; then
    echo "Extension source not found: $source_file" >&2
    exit 1
fi

mkdir -p "$destination_dir"
cp "$source_file" "$destination_file"

echo "Installed Copilot Cost Meter to $destination_file"
echo "Restart Copilot CLI, then run /cost."


#!/usr/bin/env python3
import os
import sys
import json
import shutil
import re
import xml.etree.ElementTree as ET
import fire

class QuihtJsonGen:
    def generate(self, src_dir, dest_dir, url_prefix="http://localhost:8000/", ui_files=None):
        """
        Scans and copies Qt .ui files and their associated PNG icons, and generates a .quiht.json map.

        :param src_dir: Source directory of the Proteus codebase (e.g., ./fontlab/Proteus)
        :param dest_dir: Destination directory for copied assets (e.g., ./quiht/example)
        :param url_prefix: Prefix URL for public assets in the generated map
        :param ui_files: Comma-separated list of UI filenames to copy/scan. If None, default set is used.
        """
        src_dir = os.path.abspath(src_dir)
        dest_dir = os.path.abspath(dest_dir)

        # Set default UI files if none provided
        if not ui_files:
            ui_paths = [
                "ui/yanglepopup.ui",
                "ui/yvaluepopup.ui",
                "workspace2/dlgnamesuffix.ui",
                "workspace2/welcomeform.ui"
            ]
        else:
            ui_paths = [x.strip() for x in ui_files.split(",")]

        # Create output directories
        ui_dest_dir = os.path.join(dest_dir, "ui")
        res_dest_dir = os.path.join(dest_dir, "resources")
        os.makedirs(ui_dest_dir, exist_ok=True)
        os.makedirs(res_dest_dir, exist_ok=True)

        print(f"Source Directory: {src_dir}")
        print(f"Destination Directory: {dest_dir}")
        print(f"URL Prefix: {url_prefix}")

        # First, build a index of all PNG files in the source directory to resolve QRC links
        print("Indexing PNG files in source directory...")
        png_index = {}
        for root, _, files in os.walk(src_dir):
            for file in files:
                if file.lower().endswith(".png"):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, src_dir)
                    # Index by filename and relative path suffix
                    png_index[file] = full_path
                    # E.g., index by 'resources/add.png'
                    parts = rel_path.split(os.sep)
                    for i in range(len(parts)):
                        suffix = "/".join(parts[i:])
                        png_index[suffix] = full_path

        # Map to store in .quiht.json
        manifest = {
            "prefix": url_prefix,
            "ui": {},
            "resources": {}
        }

        # Process each UI file
        for ui_rel in ui_paths:
            ui_src = os.path.join(src_dir, ui_rel)
            if not os.path.exists(ui_src):
                # Try finding it in the src_dir
                found = False
                for root, _, files in os.walk(src_dir):
                    if ui_rel in files or os.path.basename(ui_rel) in files:
                        ui_src = os.path.join(root, os.path.basename(ui_rel))
                        found = True
                        break
                if not found:
                    print(f"Warning: UI file {ui_rel} not found in {src_dir}. Skipping.")
                    continue

            ui_basename = os.path.basename(ui_src)
            ui_dest = os.path.join(ui_dest_dir, ui_basename)
            shutil.copy2(ui_src, ui_dest)
            print(f"Copied UI: {ui_basename} -> {os.path.relpath(ui_dest)}")

            # Add to manifest
            manifest["ui"][ui_basename] = f"ui/{ui_basename}"

            # Parse XML to find referenced resources
            try:
                tree = ET.parse(ui_dest)
                root = tree.getroot()
            except Exception as e:
                print(f"Error parsing XML in {ui_basename}: {e}")
                continue

            # Look for normaloff or other tags that contain image paths (like :/images/...)
            resources_found = []
            
            # Common tags in .ui files for resources: <normaloff>, <normalon>, <activeoff>, <pixmap>, etc.
            # We can run a general search on all elements with text containing ':/' or '.png'
            for elem in root.iter():
                if elem.text and (":/" in elem.text or ".png" in elem.text):
                    resources_found.append(elem.text.strip())
            
            # Also extract from attributes if any (though usually in tags)
            for elem in root.iter():
                for attr, val in elem.attrib.items():
                    if ":/" in val or ".png" in val:
                        resources_found.append(val.strip())

            # De-duplicate resources
            resources_found = list(set(resources_found))

            for res_path in resources_found:
                # Clean up the path
                # E.g. ':/images/resources/document_new.png' -> 'resources/document_new.png'
                clean_path = res_path
                if clean_path.startswith(":/"):
                    clean_path = clean_path[2:]
                if clean_path.startswith("images/"):
                    clean_path = clean_path[7:]
                if clean_path.startswith("filters/"):
                    clean_path = clean_path[8:]

                # Try to resolve in indexed PNGs
                resolved_src = None
                # Fallback mapping for missing files
                if clean_path == "resources/document_open.png":
                    clean_path = "resources/file_open.png"
                elif clean_path == "resources/document_new.png":
                    clean_path = "resources/new.png"

                # Try full suffix matching first
                if clean_path in png_index:
                    resolved_src = png_index[clean_path]
                # Try basename matching
                else:
                    base = os.path.basename(clean_path)
                    if base in png_index:
                        resolved_src = png_index[base]

                if resolved_src and os.path.exists(resolved_src):
                    res_basename = os.path.basename(resolved_src)
                    # Handle @2x assets
                    res_dest = os.path.join(res_dest_dir, res_basename)
                    shutil.copy2(resolved_src, res_dest)
                    print(f"  Resolved and copied icon: {res_path} -> {os.path.relpath(res_dest)}")
                    manifest["resources"][res_path] = f"resources/{res_basename}"
                    
                    # Also look for @2x version of the same icon and copy it if it exists
                    base_name_no_ext, ext = os.path.splitext(res_basename)
                    twox_name = f"{base_name_no_ext}@2x{ext}"
                    twox_src = os.path.join(os.path.dirname(resolved_src), twox_name)
                    if os.path.exists(twox_src):
                        twox_dest = os.path.join(res_dest_dir, twox_name)
                        shutil.copy2(twox_src, twox_dest)
                        print(f"  Resolved and copied @2x icon: {twox_name} -> {os.path.relpath(twox_dest)}")
                        # Save both normal and @2x mapping if needed, or reference it implicitly
                        name_part, ext_part = os.path.splitext(res_path)
                        twox_res_path = f"{name_part}@2x{ext_part}"
                        manifest["resources"][twox_res_path] = f"resources/{twox_name}"
                else:
                    print(f"  Warning: Could not resolve resource path: {res_path} (cleaned: {clean_path})")

        # Write manifest file
        manifest_path = os.path.join(dest_dir, ".quiht.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
        print(f"Generated manifest: {os.path.relpath(manifest_path)}")

if __name__ == "__main__":
    fire.Fire(QuihtJsonGen)

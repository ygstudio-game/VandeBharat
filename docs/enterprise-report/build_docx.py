import os
import re
import base64
import urllib.request
import subprocess
import glob

# Constants
DIR_PATH = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(DIR_PATH, "images")
COMBINED_MD = os.path.join(DIR_PATH, "combined_temp.md")

# Find a writeable output filename (in case VandeInspect_AI_Technical_Report.docx is locked)
output_filename = "VandeInspect_AI_Technical_Report.docx"
counter = 1
while True:
    try:
        test_path = os.path.join(DIR_PATH, output_filename)
        if os.path.exists(test_path):
            with open(test_path, "a+b") as f:
                pass
        break
    except IOError:
        output_filename = f"VandeInspect_AI_Technical_Report_{counter}.docx"
        counter += 1

OUTPUT_DOCX = os.path.join(DIR_PATH, output_filename)

# Create images directory if it doesn't exist
os.makedirs(IMAGES_DIR, exist_ok=True)

# Find all phase markdown files and sort them to ensure correct order
md_files = sorted(glob.glob(os.path.join(DIR_PATH, "phase-*.md")))
print(f"Found {len(md_files)} Markdown files to combine:")
for f in md_files:
    print(f" - {os.path.basename(f)}")

combined_content = []
diagram_counter = 1

# Regex to find mermaid blocks
# Matches ```mermaid ... ```
mermaid_regex = re.compile(r"```mermaid\s*\n(.*?)\n\s*```", re.DOTALL)

for file_path in md_files:
    filename = os.path.basename(file_path)
    print(f"\nProcessing {filename}...")
    
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Process all mermaid blocks in the current file
    matches = list(mermaid_regex.finditer(content))
    if matches:
        print(f"Found {len(matches)} Mermaid diagrams in {filename}.")
        
        # We process matches in reverse order to keep indices correct while modifying string
        for match in reversed(matches):
            mermaid_code = match.group(1).strip()
            
            # Base64 encode the diagram code for the mermaid.ink API
            encoded_bytes = base64.b64encode(mermaid_code.encode("utf-8"))
            encoded_str = encoded_bytes.decode("utf-8")
            
            # Use mermaid.ink to fetch PNG image
            image_url = f"https://mermaid.ink/img/{encoded_str}"
            image_filename = f"diagram_{diagram_counter}.png"
            image_path = os.path.join(IMAGES_DIR, image_filename)
            
            print(f" -> Downloading rendered diagram {diagram_counter} from {image_url}...")
            try:
                # Add headers to act as a browser to avoid potential user-agent blockings
                req = urllib.request.Request(
                    image_url, 
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                )
                with urllib.request.urlopen(req, timeout=30) as response:
                    with open(image_path, "wb") as img_file:
                        img_file.write(response.read())
                
                print(f"    Saved as images/{image_filename}")
                
                # Replace the code block with Markdown image tag using a path relative to the md file
                replacement = f"![Diagram {diagram_counter}](images/{image_filename})"
                content = content[:match.start()] + replacement + content[match.end():]
                
                diagram_counter += 1
            except Exception as e:
                print(f"    [WARNING] Failed to render/download diagram {diagram_counter}: {e}")
                print("    Leaving original code block intact.")
    
    # Append the processed markdown content with page break markers for the Word document
    combined_content.append(content)
    # Add a page break in Pandoc syntax (supported by docx writer via native pagebreaks or horizontal rules)
    combined_content.append("\n\n---\n\n")

# Write the final combined markdown file
print(f"\nWriting combined Markdown file to {COMBINED_MD}...")
with open(COMBINED_MD, "w", encoding="utf-8") as f:
    f.write("\n".join(combined_content))

# Call Pandoc to build the Word document
print(f"Calling Pandoc to build final Word document: {OUTPUT_DOCX}...")
try:
    cmd = [
        "pandoc",
        "combined_temp.md",
        "-o", output_filename,
        "--toc", # Generate table of contents
        "--toc-depth=2",
        "-f", "markdown",
        "-t", "docx"
    ]
    result = subprocess.run(cmd, cwd=DIR_PATH, check=True, capture_output=True, text=True)
    print("\n[SUCCESS] Document created successfully!")
    print(f"File location: {OUTPUT_DOCX}")
except subprocess.CalledProcessError as e:
    print(f"\n[ERROR] Pandoc failed: {e.stderr}")
except Exception as e:
    print(f"\n[ERROR] Failed to run pandoc: {e}")

# Clean up temporary combined markdown file
if os.path.exists(COMBINED_MD):
    try:
        os.remove(COMBINED_MD)
        print("Cleaned up temporary combined markdown file.")
    except Exception as e:
        print(f"Failed to remove temp file: {e}")

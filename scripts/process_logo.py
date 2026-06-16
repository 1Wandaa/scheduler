import os
import sys
from PIL import Image, ImageDraw

def process_logo(input_path, output_path):
    try:
        img = Image.open(input_path).convert("RGBA")
        width, height = img.size
        size = max(width, height)
        
        # Create a new image with the background color
        # Assuming background should be solid, let's pick a color. 
        # From manifest: background_color: "#0a1b2f", theme_color: "#0288d1"
        bg_color = "#0a1b2f"
        
        # Or let's see if the image itself is mostly transparent
        new_img = Image.new("RGBA", (size, size), bg_color)
        
        # Paste the original image in the center
        offset = ((size - width) // 2, (size - height) // 2)
        
        # If we just want a circular logo, let's make it a circle
        # but to have "no gaps" in PWA, we actually want a square image with no transparency,
        # or an image where the circle goes exactly to the edges, and the corners are transparent.
        # But wait, maskable icons shouldn't have transparent corners if we want them to fill the bounds.
        # The user said "the logo is circle", maybe they mean the content inside should be a circle.
        
        # Let's save a copy of the size and mode first so we can see
        print(f"Original size: {img.size}")
        print(f"Original mode: {img.mode}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    process_logo(sys.argv[1], sys.argv[2])

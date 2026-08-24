import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def create_shield_mask(width, height, scale_factor=4):
    """
    Renders the Avaran shield + checkmark at high resolution (scale_factor)
    using Bézier curve evaluation and returns a grayscale mask.
    """
    w = width * scale_factor
    h = height * scale_factor
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)

    def bezier_point(p0, p1, p2, p3, t):
        return (
            (1-t)**3 * p0[0] + 3*(1-t)**2 * t * p1[0] + 3*(1-t) * t**2 * p2[0] + t**3 * p3[0],
            (1-t)**3 * p0[1] + 3*(1-t)**2 * t * p1[1] + 3*(1-t) * t**2 * p2[1] + t**3 * p3[1]
        )

    # 1. Outer shield border: M12 2 L4 5 v6.09 c0 5.05 3.41 9.76 8 10.91 c4.59 -1.15 8 -5.86 8 -10.91 V5 l-8 -3 z
    # Coords in 24x24 space
    poly_outer = [(12, 2), (4, 5), (4, 11.09)]
    # Curve 1: p0=(4, 11.09), p1=(4, 16.14), p2=(7.41, 20.85), p3=(12, 22.0)
    for i in range(1, 31):
        t = i / 30.0
        poly_outer.append(bezier_point((4, 11.09), (4, 16.14), (7.41, 20.85), (12, 22.0), t))
    # Curve 2: p0=(12, 22.0), p1=(16.59, 20.85), p2=(20, 16.14), p3=(20, 11.09)
    for i in range(1, 31):
        t = i / 30.0
        poly_outer.append(bezier_point((12, 22.0), (16.59, 20.85), (20, 16.14), (20, 11.09), t))
    poly_outer.append((20, 5))
    poly_outer.append((12, 2))

    # Scale to canvas
    scaled_outer = [(x * w / 24.0, y * h / 24.0) for x, y in poly_outer]
    draw.polygon(scaled_outer, fill=255)

    # 2. Inner shield cutout: M12 4.18 l6 2.25 v4.66 c0 4.14 -2.73 8.01 -6 9.08 c-3.27 -1.07 -6 -4.94 -6 -9.08 V6.43 l6 -2.25 z
    poly_inner = [(12, 4.18), (18, 6.43), (18, 11.09)]
    # Inner curve 1: p0=(18, 11.09), p1=(18, 15.23), p2=(15.27, 19.10), p3=(12, 20.17)
    for i in range(1, 31):
        t = i / 30.0
        poly_inner.append(bezier_point((18, 11.09), (18, 15.23), (15.27, 19.10), (12, 20.17), t))
    # Inner curve 2: p0=(12, 20.17), p1=(8.73, 19.10), p2=(6, 15.23), p3=(6, 11.09)
    for i in range(1, 31):
        t = i / 30.0
        poly_inner.append(bezier_point((12, 20.17), (8.73, 19.10), (6, 15.23), (6, 11.09), t))
    poly_inner.append((6, 6.43))
    poly_inner.append((12, 4.18))

    scaled_inner = [(x * w / 24.0, y * h / 24.0) for x, y in poly_inner]
    draw.polygon(scaled_inner, fill=0)

    # 3. Checkmark in center: M10.5 13.5 l-2 -2 l-1.41 1.41 L10.5 16.33 l6.5 -6.5 l-1.41 -1.41 z
    poly_check = [
        (10.5, 13.5),
        (8.5, 11.5),
        (7.09, 12.91),
        (10.5, 16.33),
        (17.0, 9.83),
        (15.59, 8.42),
        (10.5, 13.5)
    ]
    scaled_check = [(x * w / 24.0, y * h / 24.0) for x, y in poly_check]
    draw.polygon(scaled_check, fill=255)

    # Downsample with Lanczos for perfect anti-aliasing
    return mask.resize((width, height), Image.Resampling.LANCZOS)


def generate_icon(output_path):
    """
    Generates 1024x1024 app icon.
    Deep #3F7C78 background with elegant subtle gradient, centered Avaran shield mark in pure white.
    """
    size = 1024
    img = Image.new("RGB", (size, size), (63, 124, 120))
    
    # Create smooth subtle linear gradient (#468984 top to #366B67 bottom)
    draw = ImageDraw.Draw(img)
    for y in range(size):
        ratio = y / float(size)
        r = int(70 * (1 - ratio) + 54 * ratio)
        g = int(137 * (1 - ratio) + 107 * ratio)
        b = int(132 * (1 - ratio) + 103 * ratio)
        draw.line([(0, y), (size, y)], fill=(r, g, b))

    # Shield size: 540x540
    shield_size = 540
    shield_mask = create_shield_mask(shield_size, shield_size, scale_factor=4)

    # Create solid white layer with mask
    white_layer = Image.new("RGBA", (shield_size, shield_size), (255, 255, 255, 255))
    
    # Position in center
    pos_x = (size - shield_size) // 2
    pos_y = (size - shield_size) // 2

    # Subtle drop shadow behind shield
    shadow_mask = shield_mask.filter(ImageFilter.GaussianBlur(radius=8))
    shadow_layer = Image.new("RGBA", (shield_size, shield_size), (20, 50, 48, 120))
    img.paste(shadow_layer, (pos_x, pos_y + 8), shadow_mask)

    img.paste(white_layer, (pos_x, pos_y), shield_mask)
    img.save(output_path, "PNG")
    print(f"Generated icon: {output_path} ({size}x{size})")


def generate_adaptive_icon(output_path):
    """
    Generates 1024x1024 Android adaptive icon foreground.
    Safe zone: central 66% (diameter 680px).
    Emblem size: 500x500 squircle containing the shield.
    Surrounding background is transparent RGBA.
    """
    size = 1024
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Create squircle emblem at 4x resolution
    scale = 4
    high_w = size * scale
    em_size = 500 * scale
    radius = 125 * scale
    
    em_img = Image.new("RGBA", (high_w, high_w), (0, 0, 0, 0))
    draw = ImageDraw.Draw(em_img)
    
    em_x = (high_w - em_size) // 2
    em_y = (high_w - em_size) // 2

    # Draw rounded rectangle emblem with smooth gradient
    draw.rounded_rectangle(
        [em_x, em_y, em_x + em_size, em_y + em_size],
        radius=radius,
        fill=(63, 124, 120, 255)
    )

    # Downsample emblem
    emblem = em_img.resize((size, size), Image.Resampling.LANCZOS)
    img = Image.alpha_composite(img, emblem)

    # Shield size: 280x280 inside emblem
    shield_size = 280
    shield_mask = create_shield_mask(shield_size, shield_size, scale_factor=4)
    white_layer = Image.new("RGBA", (shield_size, shield_size), (255, 255, 255, 255))

    pos_x = (size - shield_size) // 2
    pos_y = (size - shield_size) // 2
    img.paste(white_layer, (pos_x, pos_y), shield_mask)

    img.save(output_path, "PNG")
    print(f"Generated adaptive-icon: {output_path} ({size}x{size})")


def generate_splash(output_path):
    """
    Generates 1284x2778 high-resolution portrait splash screen.
    Background: #F8F9FA
    Centered Avaran emblem + Clean Institutional Typography.
    """
    w, h = 1284, 2778
    img = Image.new("RGBA", (w, h), (248, 249, 250, 255))
    draw = ImageDraw.Draw(img)

    # Center emblem position
    cx = w // 2
    cy = h // 2 - 80

    em_size = 220
    radius = 55
    em_x = cx - em_size // 2
    em_y = cy - em_size // 2

    # High-res emblem
    scale = 4
    high_w = em_size * scale
    high_r = radius * scale
    em_hi = Image.new("RGBA", (high_w, high_w), (0, 0, 0, 0))
    draw_hi = ImageDraw.Draw(em_hi)
    draw_hi.rounded_rectangle([0, 0, high_w, high_w], radius=high_r, fill=(63, 124, 120, 255))
    emblem = em_hi.resize((em_size, em_size), Image.Resampling.LANCZOS)

    # Shadow for emblem
    shadow_mask = Image.new("L", (em_size, em_size), 0)
    ImageDraw.Draw(shadow_mask).rounded_rectangle([0, 0, em_size, em_size], radius=radius, fill=100)
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(radius=10))
    shadow_layer = Image.new("RGBA", (em_size, em_size), (63, 124, 120, 80))
    img.paste(shadow_layer, (em_x, em_y + 8), shadow_mask)

    img.paste(emblem, (em_x, em_y), emblem)

    # Shield inside emblem: 130x130
    shield_size = 130
    shield_mask = create_shield_mask(shield_size, shield_size, scale_factor=4)
    white_layer = Image.new("RGBA", (shield_size, shield_size), (255, 255, 255, 255))
    img.paste(white_layer, (cx - shield_size // 2, cy - shield_size // 2), shield_mask)

    # Typography
    # Draw AVARAN text
    try:
        font_title = ImageFont.truetype("arialbd.ttf", 52)
        font_sub = ImageFont.truetype("arial.ttf", 24)
    except Exception:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()

    title_text = "AVARAN"
    sub_text = "Customer Fraud Protection"

    # Measure and draw title
    bbox_title = draw.textbbox((0, 0), title_text, font=font_title)
    tw = bbox_title[2] - bbox_title[0]
    draw.text((cx - tw // 2, em_y + em_size + 64), title_text, fill=(37, 37, 37, 255), font=font_title)

    # Measure and draw subtitle
    bbox_sub = draw.textbbox((0, 0), sub_text, font=font_sub)
    sw = bbox_sub[2] - bbox_sub[0]
    draw.text((cx - sw // 2, em_y + em_size + 130), sub_text, fill=(111, 112, 111, 255), font=font_sub)

    img.save(output_path, "PNG")
    print(f"Generated splash: {output_path} ({w}x{h})")


if __name__ == "__main__":
    assets_dir = os.path.join("apps", "mobile", "assets")
    os.makedirs(assets_dir, exist_ok=True)

    generate_icon(os.path.join(assets_dir, "icon.png"))
    generate_adaptive_icon(os.path.join(assets_dir, "adaptive-icon.png"))
    generate_splash(os.path.join(assets_dir, "splash.png"))
    print("All assets generated successfully!")

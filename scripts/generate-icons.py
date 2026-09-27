"""Génère assets/icon.png (512x512) et assets/icon.ico (multi-tailles)
à partir du design LocalDrop : fond bleu accent (#4f6df5), motif QR blanc
stylisé, cohérent avec le logo utilisé dans l'interface (logo-dot bleu).
"""
from PIL import Image, ImageDraw

SIZE = 512
ACCENT = (79, 109, 245, 255)   # --accent
WHITE = (255, 255, 255, 255)

def build_icon():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Fond : carré arrondi bleu accent (cohérent avec --radius du design).
    radius = int(SIZE * 0.22)
    draw.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=ACCENT)

    # Motif QR stylisé : 3 grands carreaux d'angle + points centraux,
    # en blanc sur fond bleu, pour rester lisible en petite taille (16px).
    margin = int(SIZE * 0.16)
    block = int(SIZE * 0.20)
    gap = int(SIZE * 0.06)

    def qr_corner(x, y):
        draw.rounded_rectangle([x, y, x + block, y + block], radius=int(block * 0.18), fill=WHITE)
        inner = int(block * 0.32)
        draw.rounded_rectangle(
            [x + inner, y + inner, x + block - inner, y + block - inner],
            radius=int(block * 0.10),
            fill=ACCENT,
        )

    qr_corner(margin, margin)
    qr_corner(SIZE - margin - block, margin)
    qr_corner(margin, SIZE - margin - block)

    # Quelques petits carreaux pour évoquer la donnée QR sans surcharger.
    dot = int(block * 0.30)
    positions = [
        (SIZE - margin - block, SIZE - margin - block - gap - dot),
        (SIZE - margin - block - gap - dot, SIZE - margin - block),
        (SIZE - margin - block - gap - dot, SIZE - margin - block - gap - dot),
        (SIZE // 2 - dot // 2, SIZE // 2 - dot // 2),
    ]
    for (x, y) in positions:
        draw.rounded_rectangle([x, y, x + dot, y + dot], radius=int(dot * 0.2), fill=WHITE)

    return img

if __name__ == "__main__":
    icon = build_icon()
    icon.save("/home/claude/LocalDrop/assets/icon.png", "PNG")

    sizes = [16, 24, 32, 48, 64, 128, 256]
    icon.save(
        "/home/claude/LocalDrop/assets/icon.ico",
        format="ICO",
        sizes=[(s, s) for s in sizes],
    )
    print("Icônes générées : icon.png (512x512) + icon.ico (16..256)")

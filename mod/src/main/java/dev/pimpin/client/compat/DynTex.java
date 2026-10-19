package dev.pimpin.client.compat;

import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
//#if MC >= 1.21.11
import net.minecraft.resources.Identifier;
//#else
import net.minecraft.resources.ResourceLocation;
//#endif
//#if MC >= 1.21.6
import net.minecraft.client.renderer.RenderPipelines;
//#elseif MC >= 1.21.2
import net.minecraft.client.renderer.RenderType;
//#endif

import java.io.InputStream;

/**
 * A texture the mod draws into itself (minimap, mod icons). Pixels are ARGB.
 * Hides the texture id class, NativeImage pixel order and blit() changes.
 */
public final class DynTex {
    //#if MC >= 1.21.11
    private final Identifier id;
    //#else
    private final ResourceLocation id;
    //#endif
    private final DynamicTexture texture;
    private final NativeImage image;
    public final int width;
    public final int height;

    private DynTex(String path, NativeImage image) {
        //#if MC >= 1.21.11
        this.id = Identifier.fromNamespaceAndPath("pimpin", path);
        //#elseif MC >= 1.21
        this.id = ResourceLocation.fromNamespaceAndPath("pimpin", path);
        //#else
        this.id = new ResourceLocation("pimpin", path);
        //#endif
        this.image = image;
        this.width = image.getWidth();
        this.height = image.getHeight();
        //#if MC >= 1.21.5
        this.texture = new DynamicTexture(() -> "pimpin:" + path, image);
        //#else
        this.texture = new DynamicTexture(image);
        //#endif
        Minecraft.getInstance().getTextureManager().register(id, texture);
    }

    public static DynTex create(String path, int w, int h) {
        return new DynTex(path, new NativeImage(w, h, true));
    }

    public static DynTex read(String path, InputStream in) throws java.io.IOException {
        return new DynTex(path, NativeImage.read(in));
    }

    public void set(int x, int y, int argb) {
        //#if MC >= 1.21.3
        image.setPixel(x, y, argb);
        //#else
        int abgr = (argb & 0xFF00FF00) | ((argb >> 16) & 0xFF) | ((argb & 0xFF) << 16);
        image.setPixelRGBA(x, y, abgr);
        //#endif
    }

    /** Copies a whole ARGB frame (width × height) and uploads it to the GPU. */
    public void setAll(int[] argb) {
        for (int y = 0, i = 0; y < height; y++) {
            for (int x = 0; x < width; x++, i++) set(x, y, argb[i]);
        }
        upload();
    }

    public void upload() {
        texture.upload();
    }

    /** Draws the whole texture stretched to w × h GUI pixels. */
    public void draw(Draw d, int x, int y, int w, int h) {
        var g = d.g;
        //#if MC >= 1.21.6
        g.blit(RenderPipelines.GUI_TEXTURED, id, x, y, 0f, 0f, w, h, width, height, width, height);
        //#elseif MC >= 1.21.2
        g.blit(RenderType::guiTextured, id, x, y, 0f, 0f, w, h, width, height, width, height);
        //#else
        g.blit(id, x, y, w, h, 0f, 0f, width, height, width, height);
        //#endif
    }
}

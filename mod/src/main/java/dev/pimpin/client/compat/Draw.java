package dev.pimpin.client.compat;

import net.minecraft.client.gui.Font;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.world.item.ItemStack;
//#if MC >= 26.1
import net.minecraft.client.gui.GuiGraphicsExtractor;
//#else
import net.minecraft.client.gui.GuiGraphics;
//#endif

/**
 * Thin wrapper over the game's 2D drawing object (GuiGraphics, renamed
 * GuiGraphicsExtractor in 26.1), so HUD and screen code is the same on every version.
 */
public final class Draw {
    //#if MC >= 26.1
    public final GuiGraphicsExtractor g;

    public Draw(GuiGraphicsExtractor g) {
        this.g = g;
    }
    //#else
    public final GuiGraphics g;

    public Draw(GuiGraphics g) {
        this.g = g;
    }
    //#endif

    public int width() {
        return g.guiWidth();
    }

    public int height() {
        return g.guiHeight();
    }

    public void fill(int x1, int y1, int x2, int y2, int argb) {
        g.fill(x1, y1, x2, y2, argb);
    }

    public void text(Font font, String s, int x, int y, int argb) {
        text(font, s, x, y, argb, true);
    }

    public void text(Font font, String s, int x, int y, int argb, boolean shadow) {
        //#if MC >= 26.1
        g.text(font, s, x, y, argb, shadow);
        //#else
        g.drawString(font, s, x, y, argb, shadow);
        //#endif
    }

    public void text(Font font, FormattedCharSequence s, int x, int y, int argb) {
        //#if MC >= 26.1
        g.text(font, s, x, y, argb);
        //#else
        g.drawString(font, s, x, y, argb);
        //#endif
    }

    public void centered(Font font, String s, int x, int y, int argb) {
        //#if MC >= 26.1
        g.centeredText(font, s, x, y, argb);
        //#else
        g.drawCenteredString(font, s, x, y, argb);
        //#endif
    }

    public void item(ItemStack stack, int x, int y) {
        //#if MC >= 26.1
        g.item(stack, x, y);
        //#else
        g.renderItem(stack, x, y);
        //#endif
    }

    public void itemDecorations(Font font, ItemStack stack, int x, int y) {
        //#if MC >= 26.1
        g.itemDecorations(font, stack, x, y);
        //#else
        g.renderItemDecorations(font, stack, x, y);
        //#endif
    }

    public void scissor(int x1, int y1, int x2, int y2) {
        g.enableScissor(x1, y1, x2, y2);
    }

    public void noScissor() {
        g.disableScissor();
    }

    public void push() {
        //#if MC >= 1.21.6
        g.pose().pushMatrix();
        //#else
        g.pose().pushPose();
        //#endif
    }

    public void pop() {
        //#if MC >= 1.21.6
        g.pose().popMatrix();
        //#else
        g.pose().popPose();
        //#endif
    }

    public void scale(float s) {
        //#if MC >= 1.21.6
        g.pose().scale(s, s);
        //#else
        g.pose().scale(s, s, 1f);
        //#endif
    }
}

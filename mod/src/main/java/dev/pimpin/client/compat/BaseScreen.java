package dev.pimpin.client.compat;

//#if MC >= 26.1
import net.minecraft.client.gui.GuiGraphicsExtractor;
//#else
import net.minecraft.client.gui.GuiGraphics;
//#endif
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
//#if MC >= 1.21.9
import net.minecraft.client.input.MouseButtonEvent;
//#endif

/** Screen with the mouse and background hooks that changed across versions folded into one shape. */
public abstract class BaseScreen extends Screen {
    protected BaseScreen(Component title) {
        super(title);
    }

    /** Drawn on top of the background and widgets. */
    protected abstract void draw(Draw d, int mouseX, int mouseY, float delta);

    protected boolean onClick(double x, double y, int button) {
        return false;
    }

    protected boolean onScroll(double x, double y, double amount) {
        return false;
    }

    //#if MC >= 26.1
    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float delta) {
        super.extractRenderState(g, mouseX, mouseY, delta);
        draw(new Draw(g), mouseX, mouseY, delta);
    }
    //#else
    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float delta) {
        //#if MC < 1.20.2
        renderBackground(g);
        //#endif
        super.render(g, mouseX, mouseY, delta);
        draw(new Draw(g), mouseX, mouseY, delta);
    }
    //#endif

    //#if MC >= 1.21.9
    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        if (onClick(event.x(), event.y(), event.button())) return true;
        return super.mouseClicked(event, doubleClick);
    }
    //#else
    @Override
    public boolean mouseClicked(double x, double y, int button) {
        if (onClick(x, y, button)) return true;
        return super.mouseClicked(x, y, button);
    }
    //#endif

    //#if MC >= 1.20.2
    @Override
    public boolean mouseScrolled(double x, double y, double horizontal, double vertical) {
        if (onScroll(x, y, vertical)) return true;
        return super.mouseScrolled(x, y, horizontal, vertical);
    }
    //#else
    @Override
    public boolean mouseScrolled(double x, double y, double amount) {
        if (onScroll(x, y, amount)) return true;
        return super.mouseScrolled(x, y, amount);
    }
    //#endif
}

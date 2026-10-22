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

    /** Custom canvas screens can keep their action buttons above draggable content. */
    protected final void drawWidgetsOnTop(Draw d, int x, int y, float delta) {
        for (var child : children()) if (child instanceof net.minecraft.client.gui.components.AbstractWidget widget) {
            //#if MC >= 26.1
            widget.extractRenderState(d.g, x, y, delta);
            //#else
            widget.render(d.g, x, y, delta);
            //#endif
        }
    }

    protected boolean onDrag(double x, double y, int button, double dx, double dy) { return false; }

    protected boolean onRelease(double x, double y, int button) { return false; }

    //#if MC >= 1.21.9
    @Override
    public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
        if (onDrag(event.x(), event.y(), event.button(), dx, dy)) return true;
        return super.mouseDragged(event, dx, dy);
    }
    @Override
    public boolean mouseReleased(MouseButtonEvent event) {
        if (onRelease(event.x(), event.y(), event.button())) return true;
        return super.mouseReleased(event);
    }
    //#else
    @Override
    public boolean mouseDragged(double x, double y, int button, double dx, double dy) {
        if (onDrag(x, y, button, dx, dy)) return true;
        return super.mouseDragged(x, y, button, dx, dy);
    }
    @Override
    public boolean mouseReleased(double x, double y, int button) {
        if (onRelease(x, y, button)) return true;
        return super.mouseReleased(x, y, button);
    }
    //#endif

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

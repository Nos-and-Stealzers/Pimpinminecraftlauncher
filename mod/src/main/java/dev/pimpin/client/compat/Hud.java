package dev.pimpin.client.compat;

import java.util.function.Consumer;
//#if MC >= 1.21.6
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
//#else
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
//#endif

/** Hooks a HUD renderer into the game; the Fabric API for this changed in 1.21.6. */
public final class Hud {
    private Hud() {}

    public static void register(Consumer<Draw> renderer) {
        //#if MC >= 1.21.11
        HudElementRegistry.addLast(net.minecraft.resources.Identifier.fromNamespaceAndPath("pimpin", "hud"), (graphics, tickCounter) -> renderer.accept(new Draw(graphics)));
        //#elseif MC >= 1.21.6
        HudElementRegistry.addLast(net.minecraft.resources.ResourceLocation.fromNamespaceAndPath("pimpin", "hud"), (graphics, tickCounter) -> renderer.accept(new Draw(graphics)));
        //#else
        HudRenderCallback.EVENT.register((graphics, tickDelta) -> renderer.accept(new Draw(graphics)));
        //#endif
    }
}

package dev.pimpin.client.mixin;

//#if MC < 1.21.6
import dev.pimpin.client.hud.LegacyHudWrapper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/**
 * Wraps HudRenderCallback listeners on Fabric's array-backed event (pre-1.21.6),
 * so every third-party HUD the event draws can be moved/scaled/hidden. The
 * handler array's component type identifies which event this instance invokes;
 * only HudRenderCallback's event is touched. Empty on 1.21.6+ where hud elements
 * are intercepted by HudElementRegistryMixin instead.
 */
@Mixin(targets = "net.fabricmc.fabric.impl.base.event.ArrayBackedEvent")
public abstract class ForeignHudEventMixin {
    @Shadow(remap = false)
    private Object[] handlers;

    @ModifyVariable(
            method = {
                    "register(Ljava/lang/Object;)V",
                    "register(Lnet/minecraft/resources/ResourceLocation;Ljava/lang/Object;)V"
            },
            at = @At("HEAD"),
            argsOnly = true,
            ordinal = 0
    )
    private Object pimpin$wrapListener(Object listener) {
        Object[] current = this.handlers;
        if (current == null || current.getClass().getComponentType() != HudRenderCallback.class) return listener;
        return LegacyHudWrapper.wrap(listener);
    }
}
//#endif

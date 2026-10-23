package dev.pimpin.client.mixin;

//#if MC >= 1.21.6
import dev.pimpin.client.hud.ModernHudWrapper;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArgs;
import org.spongepowered.asm.mixin.injection.invoke.arg.Args;

/**
 * Intercepts every third-party HUD layer registration on Fabric's hud registry
 * (1.21.6+): addFirst/addLast and the two attach methods all route through
 * HudLayer.ofElement, so swapping its element argument wraps each foreign HUD
 * with a movable/scaleable/hideable wrapper. Empty on older versions; the
 * legacy HudRenderCallback event is intercepted by ForeignHudEventMixin.
 */
@Mixin(targets = "net.fabricmc.fabric.impl.client.rendering.hud.HudElementRegistryImpl", remap = false)
public abstract class HudElementRegistryMixin {
    @ModifyArgs(
            method = { "addFirst", "addLast", "attachElementBefore*", "attachElementAfter*" },
            at = @At(
                    value = "INVOKE",
                    target = "Lnet/fabricmc/fabric/impl/client/rendering/hud/HudLayer;ofElement",
                    remap = false
            )
    )
    private static void pimpin$wrapForeign(Args args) {
        args.set(1, ModernHudWrapper.wrap(args.get(0), args.get(1)));
    }
}
//#endif

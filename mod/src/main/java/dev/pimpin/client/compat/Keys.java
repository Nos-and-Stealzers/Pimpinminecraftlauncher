package dev.pimpin.client.compat;

import com.mojang.blaze3d.platform.InputConstants;
//#if MC >= 26.1
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
//#else
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
//#endif
import net.minecraft.client.KeyMapping;

/** Registers the Pimpin key binds under one "Pimpin Client" category. */
public final class Keys {
    //#if MC >= 1.21.9
    //#if MC >= 1.21.11
    private static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(net.minecraft.resources.Identifier.fromNamespaceAndPath("pimpin", "main"));
    //#else
    private static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(net.minecraft.resources.ResourceLocation.fromNamespaceAndPath("pimpin", "main"));
    //#endif
    //#else
    private static final String CATEGORY = "key.categories.pimpin";
    //#endif

    private Keys() {}

    /** @param glfwKey an InputConstants.KEY_* code, or InputConstants.UNKNOWN.getValue() for unbound */
    public static KeyMapping register(String name, int glfwKey) {
        //#if MC >= 26.3
        KeyMapping key = new KeyMapping("key.pimpin." + name, InputConstants.Type.KEYBOARD, glfwKey, CATEGORY);
        //#else
        KeyMapping key = new KeyMapping("key.pimpin." + name, InputConstants.Type.KEYSYM, glfwKey, CATEGORY);
        //#endif
        //#if MC >= 26.1
        return KeyMappingHelper.registerKeyMapping(key);
        //#else
        return KeyBindingHelper.registerKeyBinding(key);
        //#endif
    }
}

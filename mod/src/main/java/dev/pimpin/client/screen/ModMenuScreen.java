package dev.pimpin.client.screen;

import dev.pimpin.client.PimpinClient;
import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.BaseScreen;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.compat.DynTex;
import dev.pimpin.client.feature.FpsBooster;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.fabricmc.loader.api.metadata.ModMetadata;
import net.fabricmc.loader.api.metadata.Person;
import dev.pimpin.client.compat.Draw;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/** Built-in mod menu: every loaded mod with its icon, details and links. */
public final class ModMenuScreen extends BaseScreen {
    private static final int ROW = 30;
    private static final Map<String, Optional<DynTex>> ICONS = new HashMap<>();

    private final Screen parent;
    private final List<ModContainer> all;
    private List<ModContainer> shown = new ArrayList<>();
    private ModContainer selected;
    private EditBox search;
    private Button linkButton;
    private boolean showLibraries;
    private double scroll;

    public ModMenuScreen(Screen parent) {
        super(Component.literal("Mods"));
        this.parent = parent;
        this.all = FabricLoader.getInstance().getAllMods().stream()
                .sorted(Comparator.comparing((ModContainer m) -> !m.getMetadata().getId().equals("pimpin"))
                        .thenComparing(m -> m.getMetadata().getName().toLowerCase(Locale.ROOT)))
                .collect(Collectors.toList());
    }

    private static boolean isLibrary(ModContainer m) {
        String id = m.getMetadata().getId();
        if (id.equals("java") || id.equals("minecraft") || id.equals("fabricloader") || id.equals("mixinextras")) return true;
        if (m.getContainingMod().isPresent()) return true; // bundled inside another mod
        return m.getMetadata().containsCustomValue("fabric-api:module-lifecycle") && !id.equals("fabric-api");
    }

    private void filter() {
        String q = search == null ? "" : search.getValue().toLowerCase(Locale.ROOT).trim();
        shown = all.stream()
                .filter(m -> showLibraries || !isLibrary(m))
                .filter(m -> q.isEmpty() || m.getMetadata().getName().toLowerCase(Locale.ROOT).contains(q) || m.getMetadata().getId().contains(q))
                .collect(Collectors.toList());
        if (selected == null || !shown.contains(selected)) selected = shown.isEmpty() ? null : shown.get(0);
        scroll = 0;
        updateButtons();
    }

    private int listW() {
        return Math.min(220, width / 2 - 20);
    }

    @Override
    protected void init() {
        int lw = listW();
        String old = search == null ? "" : search.getValue();
        search = new EditBox(font, 10, 22, lw, 18, Component.literal("Search mods"));
        search.setHint(Component.literal("Search " + all.size() + " mods…"));
        search.setValue(old);
        search.setResponder(s -> filter());
        addRenderableWidget(search);

        int by = height - 28;
        int bw = Math.min(110, (width - 50) / 5);
        int x = 10;
        addRenderableWidget(Button.builder(Component.literal("Pimpin settings"), b -> Compat.setScreen(minecraft, new PimpinSettingsScreen(this))).bounds(x, by, bw, 20).build());
        x += bw + 6;
        addRenderableWidget(Button.builder(boostLabel(), b -> {
            FpsBooster.toggle(minecraft);
            b.setMessage(boostLabel());
        }).bounds(x, by, bw, 20).build());
        x += bw + 6;
        addRenderableWidget(Button.builder(Component.literal("Mods folder"), b -> Compat.open(FabricLoader.getInstance().getGameDir().resolve("mods").toUri())).bounds(x, by, bw, 20).build());
        x += bw + 6;
        addRenderableWidget(Button.builder(libLabel(), b -> {
            showLibraries = !showLibraries;
            b.setMessage(libLabel());
            filter();
        }).bounds(x, by, bw, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose()).bounds(width - bw - 10, by, bw, 20).build());

        linkButton = addRenderableWidget(Button.builder(Component.literal("Website"), b -> {
            String url = link(selected);
            if (url == null) return;
            try {
                Compat.open(URI.create(url));
            } catch (IllegalArgumentException e) {
                PimpinClient.LOG.warn("Bad link {}", url);
            }
        }).bounds(lw + 30, by - 26, 90, 20).build());
        filter();
    }

    private Component boostLabel() {
        return Component.literal(FpsBooster.isBoosted() ? "FPS boost: §aON" : "FPS boost: OFF");
    }

    private Component libLabel() {
        return Component.literal(showLibraries ? "Hide libraries" : "Show libraries");
    }

    private static String link(ModContainer m) {
        if (m == null) return null;
        var contact = m.getMetadata().getContact();
        return contact.get("homepage").or(() -> contact.get("sources")).or(() -> contact.get("issues")).orElse(null);
    }

    private void updateButtons() {
        if (linkButton != null) linkButton.visible = link(selected) != null;
    }

    @Override
    protected void draw(Draw g, int mouseX, int mouseY, float delta) {
        int accent = PimpinConfig.get().accent;
        g.text(font, "§lPimpin Mod Menu §r§7- " + shown.size() + " shown", 10, 8, 0xFFFFFFFF);

        int lw = listW();
        int top = 46;
        int bottom = height - 36;
        g.fill(10, top, 10 + lw, bottom, 0x66000000);
        g.scissor(10, top, 10 + lw, bottom);
        int y = top - (int) scroll;
        for (ModContainer m : shown) {
            if (y + ROW >= top && y <= bottom) {
                boolean hover = mouseX >= 10 && mouseX < 10 + lw && mouseY >= y && mouseY < y + ROW && mouseY >= top && mouseY < bottom;
                if (m == selected) g.fill(10, y, 10 + lw, y + ROW, (accent & 0x00FFFFFF) | 0x55000000);
                else if (hover) g.fill(10, y, 10 + lw, y + ROW, 0x33FFFFFF);
                drawIcon(g, m, 14, y + 3, 24);
                ModMetadata md = m.getMetadata();
                g.text(font, font.plainSubstrByWidth(md.getName(), lw - 46), 42, y + 5, 0xFFFFFFFF);
                g.text(font, font.plainSubstrByWidth(md.getVersion().getFriendlyString(), lw - 46), 42, y + 16, 0xFF9A9A9A);
            }
            y += ROW;
        }
        g.noScissor();
        if (shown.isEmpty()) g.centered(font, "No mods match", 10 + lw / 2, top + 12, 0xFF9A9A9A);

        if (selected != null) drawDetails(g, lw + 30, top, width - lw - 40, bottom - 30 - top);
    }

    private void drawDetails(Draw g, int x, int y, int w, int h) {
        ModMetadata md = selected.getMetadata();
        drawIcon(g, selected, x, y, 40);
        g.text(font, "§l" + md.getName(), x + 48, y + 4, 0xFFFFFFFF);
        g.text(font, "§7" + md.getId() + "  §8|  §7v" + md.getVersion().getFriendlyString(), x + 48, y + 18, 0xFFFFFFFF);
        String authors = md.getAuthors().stream().map(Person::getName).collect(Collectors.joining(", "));
        int ty = y + 50;
        if (!authors.isEmpty()) {
            for (FormattedCharSequence line : font.split(Component.literal("§7By §f" + authors), w)) {
                g.text(font, line, x, ty, 0xFFFFFFFF);
                ty += 11;
            }
            ty += 4;
        }
        String desc = md.getDescription().isEmpty() ? "No description." : md.getDescription();
        for (FormattedCharSequence line : font.split(Component.literal(desc), w)) {
            if (ty > y + h - 12) break;
            g.text(font, line, x, ty, 0xFFDDDDDD);
            ty += 11;
        }
        if (md.getId().equals("pimpin")) {
            ty += 6;
            String[] tips = {
                    "§d" + Compat.keyName(PimpinClient.menuKey) + "§7 opens this menu",
                    "§d" + Compat.keyName(PimpinClient.zoomKey) + "§7 zoom (scroll to adjust)",
                    "§d" + Compat.keyName(PimpinClient.minimapKey) + "§7 minimap, §d" + Compat.keyName(PimpinClient.minimapZoomKey) + "§7 minimap zoom",
                    "§d" + Compat.keyName(PimpinClient.bigMapKey) + "§7 hold for the big map (scroll to zoom)",
                    "§d" + Compat.keyName(PimpinClient.waypointKey) + "§7 adds a waypoint where you stand",
            };
            for (String tip : tips) {
                if (ty > y + h - 12) break;
                g.text(font, tip, x, ty, 0xFFFFFFFF);
                ty += 11;
            }
        }
    }


    private void drawIcon(Draw g, ModContainer m, int x, int y, int size) {
        Optional<DynTex> icon = ICONS.computeIfAbsent(m.getMetadata().getId(), id -> loadIcon(m));
        if (icon.isPresent()) {
            icon.get().draw(g, x, y, size, size);
        } else {
            String name = m.getMetadata().getName();
            int hue = (name.hashCode() & 0xFFFFFF) | 0xFF404040;
            g.fill(x, y, x + size, y + size, hue);
            g.centered(font, name.isEmpty() ? "?" : name.substring(0, 1).toUpperCase(Locale.ROOT), x + size / 2, y + (size - 8) / 2, 0xFFFFFFFF);
        }
    }

    private Optional<DynTex> loadIcon(ModContainer m) {
        try {
            Optional<String> path = m.getMetadata().getIconPath(64);
            if (path.isEmpty()) return Optional.empty();
            Optional<Path> file = m.findPath(path.get());
            if (file.isEmpty() || !Files.exists(file.get())) return Optional.empty();
            try (InputStream in = Files.newInputStream(file.get())) {
                String safe = m.getMetadata().getId().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_.-]", "_");
                return Optional.of(DynTex.read("modicon/" + safe, in));
            }
        } catch (Exception e) {
            PimpinClient.LOG.debug("No icon for {}", m.getMetadata().getId(), e);
            return Optional.empty();
        }
    }

    @Override
    protected boolean onClick(double mouseX, double mouseY, int button) {
        int lw = listW();
        int top = 46;
        int bottom = height - 36;
        if (mouseX >= 10 && mouseX < 10 + lw && mouseY >= top && mouseY < bottom) {
            int index = (int) ((mouseY - top + scroll) / ROW);
            if (index >= 0 && index < shown.size()) {
                selected = shown.get(index);
                updateButtons();
                return true;
            }
        }
        return false;
    }

    @Override
    protected boolean onScroll(double mouseX, double mouseY, double amount) {
        int visible = height - 36 - 46;
        double max = Math.max(0, shown.size() * ROW - visible);
        scroll = Math.max(0, Math.min(max, scroll - amount * ROW));
        return true;
    }

    @Override
    public void onClose() {
        Compat.setScreen(minecraft, parent);
    }
}

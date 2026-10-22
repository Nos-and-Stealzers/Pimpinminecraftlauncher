package dev.pimpin.client.screen;

import dev.pimpin.client.PimpinConfig;
import dev.pimpin.client.compat.BaseScreen;
import dev.pimpin.client.compat.Compat;
import dev.pimpin.client.feature.DeathTracker;
import dev.pimpin.client.feature.FpsBooster;
import dev.pimpin.client.feature.Waypoints;
import dev.pimpin.client.feature.ToggleSprint;
import dev.pimpin.client.hud.Minimap;
import dev.pimpin.client.compat.Draw;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Pimpin Client settings, in five tabs of on/off and cycling buttons. */
public final class PimpinSettingsScreen extends BaseScreen {
    private static final String[] TABS = {"HUD", "Minimap", "Zoom & FPS", "General", "Quality of life"};
    private static final String[] CORNERS = {"Top left", "Top right", "Bottom left", "Bottom right"};
    private static final int[] ACCENTS = {0xFFB56CFF, 0xFFFF4FB8, 0xFF55FF55, 0xFF55FFFF, 0xFFFFAA00, 0xFFFF5555, 0xFFFFFFFF};
    private static final String[] ACCENT_NAMES = {"Violet", "Pink", "Green", "Aqua", "Gold", "Red", "White"};
    private static int tab;

    private int page, pageCount = 1;
    private final Screen parent;
    private final List<Button> options = new ArrayList<>();

    public PimpinSettingsScreen(Screen parent) {
        super(Component.literal("Pimpin Client settings"));
        this.parent = parent;
    }

    private interface Row {
        Component label();

        void press();
    }

    private static Row toggle(String name, Supplier<Boolean> get, Consumer<Boolean> set) {
        return new Row() {
            public Component label() {
                return Component.literal(name + ": " + (get.get() ? "§aON" : "§cOFF"));
            }

            public void press() {
                set.accept(!get.get());
            }
        };
    }

    private static Row cycle(String name, Supplier<String> value, Runnable next) {
        return new Row() {
            public Component label() {
                return Component.literal(name + ": §e" + value.get());
            }

            public void press() {
                next.run();
            }
        };
    }

    private static <T> int next(T[] values, T current) {
        for (int i = 0; i < values.length; i++) if (values[i].equals(current)) return (i + 1) % values.length;
        return 0;
    }

    private List<Row> rows() {
        PimpinConfig c = PimpinConfig.get();
        List<Row> r = new ArrayList<>();
        switch (tab) {
            case 0 -> {
                r.add(cycle("HUD layout", () -> "Edit with mouse", () -> Compat.setScreen(minecraft, new HudEditorScreen(this))));
                r.add(cycle("Panel opacity", () -> c.hudOpacity + "%", () -> c.hudOpacity = c.hudOpacity >= 100 ? 0 : c.hudOpacity + 10));
                r.add(toggle("HUD", () -> c.hud, v -> c.hud = v));
                r.add(toggle("FPS", () -> c.showFps, v -> c.showFps = v));
                r.add(toggle("Coordinates", () -> c.showCoords, v -> c.showCoords = v));
                r.add(toggle("Direction", () -> c.showDirection, v -> c.showDirection = v));
                r.add(toggle("Biome", () -> c.showBiome, v -> c.showBiome = v));
                r.add(toggle("Ping", () -> c.showPing, v -> c.showPing = v));
                r.add(toggle("Speed", () -> c.showSpeed, v -> c.showSpeed = v));
                r.add(toggle("Clock", () -> c.showClock, v -> c.showClock = v));
                r.add(toggle("Last death", () -> c.showDeath, v -> c.showDeath = v));
                r.add(toggle("Keystrokes + CPS", () -> c.keystrokes, v -> c.keystrokes = v));
                r.add(toggle("Armour & durability", () -> c.armorHud, v -> c.armorHud = v));
                r.add(cycle("Durability text", () -> dev.pimpin.client.hud.DurabilityText.MODES[c.armorReadout], () -> c.armorReadout = (c.armorReadout + 1) % 3));
                r.add(toggle("Held item in armour HUD", () -> c.armorMainHand, v -> c.armorMainHand = v));
                r.add(toggle("Offhand in armour HUD", () -> c.armorOffHand, v -> c.armorOffHand = v));
                Integer[] warningLevels = {0, 5, 10, 15, 20, 25, 30};
                r.add(cycle("Low durability warning", () -> c.armorWarningPercent == 0 ? "Off" : c.armorWarningPercent + "%", () -> c.armorWarningPercent = warningLevels[next(warningLevels, c.armorWarningPercent)]));
                r.add(toggle("Panel background", () -> c.hudBackground, v -> c.hudBackground = v));

                r.add(cycle("Size", () -> Math.round(c.hudScale * 100) + "%", () -> {
                    c.hudScale = c.hudScale >= 2f ? 0.5f : c.hudScale + 0.25f;
                    if(c.hudLayout!=null) for(int id=0;id<4;id++) c.hudLayout[id].scale=c.hudScale;
                }));
                r.add(cycle("Colour", () -> ACCENT_NAMES[indexOf(ACCENTS, c.accent)], () -> c.accent = ACCENTS[(indexOf(ACCENTS, c.accent) + 1) % ACCENTS.length]));
            }
            case 1 -> {
                r.add(toggle("Minimap", () -> c.minimap, v -> c.minimap = v));
                r.add(cycle("Size", () -> c.minimapSize + " px", () -> c.minimapSize = c.minimapSize >= 160 ? 64 : c.minimapSize + 32));
                r.add(cycle("Zoom", () -> Minimap.ZOOM_NAMES[c.mapZoom], () -> c.mapZoom = (c.mapZoom + 1) % Minimap.ZOOMS.length));
                r.add(cycle("Map position & scale", () -> "Edit layout", () -> Compat.setScreen(minecraft,new HudEditorScreen(this))));
                r.add(cycle("Shape", () -> c.minimapRound ? "Round" : "Square", () -> c.minimapRound = !c.minimapRound));
                r.add(toggle("Turn with me", () -> c.minimapRotate, v -> c.minimapRotate = v));
                r.add(toggle("Hill shading", () -> c.minimapShading, v -> c.minimapShading = v));
                r.add(toggle("Cave view underground", () -> c.minimapCaves, v -> c.minimapCaves = v));
                r.add(toggle("Other players", () -> c.minimapPlayers, v -> c.minimapPlayers = v));
                r.add(toggle("Mobs", () -> c.minimapMobs, v -> c.minimapMobs = v));
                r.add(toggle("Hostile mobs", () -> c.minimapHostiles, v -> c.minimapHostiles=v));
                r.add(toggle("Passive mobs", () -> c.minimapAnimals, v -> c.minimapAnimals=v));
                r.add(toggle("Compass labels", () -> c.minimapCompass, v -> c.minimapCompass=v));
                r.add(cycle("Entity height range", () -> c.minimapEntityHeight+" blocks", () -> c.minimapEntityHeight=c.minimapEntityHeight>=128?16:c.minimapEntityHeight*2));
                r.add(cycle("Map refresh", () -> c.minimapRefresh+" FPS", () -> c.minimapRefresh=c.minimapRefresh>=60?10:c.minimapRefresh+10));
                r.add(toggle("Waypoint markers", () -> c.minimapWaypoints, v -> c.minimapWaypoints=v));
                r.add(toggle("Off-map waypoint markers", () -> c.minimapEdgeMarkers, v -> c.minimapEdgeMarkers=v));
                r.add(cycle("Waypoint range", () -> c.minimapWaypointRange==0?"Unlimited":c.minimapWaypointRange+"m", () -> c.minimapWaypointRange=c.minimapWaypointRange==0?256:c.minimapWaypointRange>=4096?0:c.minimapWaypointRange*2));
                r.add(cycle("Waypoints", () -> String.valueOf(Waypoints.here(minecraft).size()), () -> Compat.setScreen(minecraft, new WaypointsScreen(this))));
                r.add(toggle("Coordinates under map", () -> c.minimapCoords, v -> c.minimapCoords = v));
                r.add(cycle("Death marker", () -> "Clear", DeathTracker::clear));
                r.add(cycle("Forget explored map", () -> "Click", Minimap::clearCache));
            }
            case 2 -> {
                Float[] zooms = {2f, 3f, 4f, 6f, 8f, 12f};
                r.add(cycle("Zoom strength", () -> Math.round(c.zoomFactor) + "x", () -> c.zoomFactor = zooms[next(zooms, c.zoomFactor)]));
                r.add(toggle("Smooth zoom", () -> c.smoothZoom, v -> c.smoothZoom = v));
                r.add(toggle("Scroll to zoom", () -> c.scrollZoom, v -> c.scrollZoom = v));
                r.add(toggle("FPS boost (fast settings)", FpsBooster::isBoosted, v -> FpsBooster.toggle(minecraft)));
                r.add(toggle("Save power in background", () -> c.backgroundFps, v -> c.backgroundFps = v));
                Integer[] limits = {10, 15, 30, 60};
                r.add(cycle("Background FPS", () -> String.valueOf(c.backgroundFpsLimit), () -> c.backgroundFpsLimit = limits[next(limits, c.backgroundFpsLimit)]));
            }
            case 3 -> {
                r.add(toggle("Pimpin button on menus", () -> c.menuButtons, v -> c.menuButtons = v));
                r.add(toggle("Pimpin loading screen", () -> c.brandedLoading, v -> c.brandedLoading = v));
                r.add(cycle("Controls", () -> "Open", () -> Compat.setScreen(minecraft, keyBinds())));
                r.add(cycle("Mod menu", () -> "Open", () -> Compat.setScreen(minecraft, new ModMenuScreen(this))));
                r.add(cycle("Reset all settings", () -> "Click", () -> {
                    if (c.boostActive) FpsBooster.disable(minecraft);
                    ToggleSprint.restore(minecraft);
                    PimpinConfig.reset();
                }));
            }
            default -> {
                r.add(toggle("Native toggle sprint", () -> c.toggleSprint, v -> {
                    c.toggleSprint = v;
                    ToggleSprint.tick(minecraft);
                }));
                r.add(toggle("Active effects HUD", () -> c.effectHud, v -> c.effectHud = v));
                r.add(cycle("Effect rows", () -> String.valueOf(c.effectHudRows), () -> c.effectHudRows = c.effectHudRows >= 12 ? 4 : c.effectHudRows + 4));
                r.add(cycle("Copy coordinates", () -> "Open", () -> Compat.setScreen(minecraft, new CoordinatesScreen(this))));
                r.add(cycle("Controls", () -> "Open", () -> Compat.setScreen(minecraft, keyBinds())));
            }
        }
        return r;
    }

    private Screen keyBinds() {
        //#if MC >= 1.21
        return new net.minecraft.client.gui.screens.options.controls.KeyBindsScreen(this, minecraft.options);
        //#else
        return new net.minecraft.client.gui.screens.controls.KeyBindsScreen(this, minecraft.options);
        //#endif
    }

    private static int indexOf(int[] arr, int v) {
        for (int i = 0; i < arr.length; i++) if (arr[i] == v) return i;
        return 0;
    }

    @Override
    protected void init() {
        options.clear();
        if(width >= 540) {
            int tw=Math.min(108,(width-32)/TABS.length-4),tx=(width-(tw+4)*TABS.length+4)/2;
            for(int i=0;i<TABS.length;i++) {
                final int t=i;
                Button button=Button.builder(Component.literal(TABS[i]),b->selectTab(t)).bounds(tx+i*(tw+4),26,tw,20).build();
                button.active=i!=tab; addRenderableWidget(button);
            }
        } else {
            int tw=Math.min(220,width-80),tx=(width-tw)/2;
            addRenderableWidget(Button.builder(Component.literal("<"),b->selectTab(Math.floorMod(tab-1,TABS.length))).bounds(tx-26,26,22,20).build());
            addRenderableWidget(Button.builder(Component.literal(TABS[tab]+" ("+(tab+1)+"/"+TABS.length+")"),b->selectTab((tab+1)%TABS.length)).bounds(tx,26,tw,20).build());
            addRenderableWidget(Button.builder(Component.literal(">"),b->selectTab((tab+1)%TABS.length)).bounds(tx+tw+4,26,22,20).build());
        }
        List<Row> all=rows();
        int columns=width>=500?2:1, perColumn=Math.max(1,(height-120)/24), capacity=columns*perColumn;
        pageCount=Math.max(1,(all.size()+capacity-1)/capacity);page=Math.max(0,Math.min(page,pageCount-1));
        int first=page*capacity,last=Math.min(all.size(),first+capacity);
        List<Row> shown=all.subList(first,last);
        int colW=Math.min(240,(width-28-(columns-1)*8)/columns),left=(width-(colW*columns+8*(columns-1)))/2;
        for(int i=0;i<shown.size();i++) {
            Row row=shown.get(i);
            Button button=Button.builder(row.label(),btn->{row.press();PimpinConfig.save();refreshLabels(shown);})
                .bounds(left+(i%columns)*(colW+8),56+(i/columns)*24,colW,20).build();
            options.add(button);addRenderableWidget(button);
        }
        if(pageCount>1) {
            Button previous=Button.builder(Component.literal("<"),b->{page--;rebuildWidgets();}).bounds(width/2-100,height-57,35,20).build();
            previous.active=page>0;addRenderableWidget(previous);
            Button next=Button.builder(Component.literal(">"),b->{page++;rebuildWidgets();}).bounds(width/2+65,height-57,35,20).build();
            next.active=page+1<pageCount;addRenderableWidget(next);
        }
        addRenderableWidget(Button.builder(Component.literal("Done"),b->onClose()).bounds(width/2-75,height-28,150,20).build());
    }
    private void selectTab(int next) {tab=next;page=0;rebuildWidgets();}
    private void refreshLabels(List<Row> shown) {
        for(int i=0;i<shown.size() && i<options.size();i++) options.get(i).setMessage(shown.get(i).label());
    }
    @Override protected boolean onScroll(double x,double y,double amount) {
        if(amount==0 || pageCount<=1) return false;
        int next=Math.max(0,Math.min(pageCount-1,page+(amount<0?1:-1)));
        if(next!=page) {page=next;rebuildWidgets();}return true;
    }
    @Override protected void draw(Draw g,int mouseX,int mouseY,float delta) {
        g.centered(font,"Pimpin Client",width/2,10,0xFFFFFFFF);
        if(pageCount>1) g.centered(font,"Page "+(page+1)+" / "+pageCount,width/2,height-51,0xFFCCCCCC);
    }

    @Override
    public void onClose() {
        PimpinConfig.save();
        Compat.setScreen(minecraft, parent);
    }
}

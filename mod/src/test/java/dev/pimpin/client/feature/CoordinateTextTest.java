package dev.pimpin.client.feature;

public final class CoordinateTextTest {
    private static int checks;
    private static String position(String dimension, double x, double y, double z, boolean destination) throws Exception {
        Class<?> type;
        try { type = Class.forName("dev.pimpin.client.feature.CoordinateText"); }
        catch (ClassNotFoundException e) { throw new AssertionError("Dimension-labelled coordinate copying is not implemented", e); }
        return (String)type.getMethod("position", String.class, double.class, double.class, double.class, boolean.class)
                .invoke(null, dimension, x, y, z, destination);
    }
    private static void check(boolean ok, String message) { if (!ok) throw new AssertionError(message); checks++; }
    public static void main(String[] args) throws Exception {
        check(position("Overworld", 120.5, 64.9, -80.5, false).equals("Overworld: 120 64 -81"), "current floor and dimension");
        check(position("Overworld", 120.5, 64.9, -80.5, true).equals("Nether: 15 64 -11"), "OW to Nether incl negative floor");
        check(position("Nether", 15.5, 71.1, -10.1, true).equals("Overworld: 124 71 -81"), "Nether uses precise position before scaling");
        check(position("The End", 1, 2, 3, true) == null, "End has no destination conversion");
        check(position("Custom realm", 1, 2, 3, true) == null, "custom dimensions have no assumed scale");
        check(position("The End", -0.1, -0.1, 0, false).equals("The End: -1 -1 0"), "End current copy works");
        check(position("Overworld", Double.NaN, 2, 3, false) == null, "nonfinite input rejected");
        check(position("Nether", 4000000, 80, 0, true) == null, "outside world-border conversion rejected");
        check(position("Overworld", -1, 60, -8, true).equals("Nether: -1 60 -1"), "negative coordinate boundaries");
        check(position("Custom realm", 1, 2, 3, false).equals("Custom realm: 1 2 3"), "custom dimension label retained");
        check(position(null, 1, 2, 3, false) == null, "no world cannot copy");
        check(!position("Overworld", 1, 2, 3, false).startsWith("/"), "plain text never a command");
        System.out.println("PASS " + checks + " coordinate regression assertions");
    }
}

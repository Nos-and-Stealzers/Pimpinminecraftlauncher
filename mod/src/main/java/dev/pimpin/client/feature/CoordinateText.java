package dev.pimpin.client.feature;

/** Plain text only. Conversion is an estimate, never a teleport or portal-safety claim. */
public final class CoordinateText {
    private CoordinateText() {}
    public static String position(String dimension, double x, double y, double z, boolean destination) {
        if (dimension == null || !Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)) return null;
        if (destination) {
            if (dimension.equals("Overworld")) { dimension = "Nether"; x /= 8; z /= 8; }
            else if (dimension.equals("Nether")) { dimension = "Overworld"; x *= 8; z *= 8; }
            else return null;
            if (Math.abs(x) > 29999984 || Math.abs(z) > 29999984) return null;
        }
        return dimension + ": " + (long)Math.floor(x) + " " + (long)Math.floor(y) + " " + (long)Math.floor(z);
    }
}

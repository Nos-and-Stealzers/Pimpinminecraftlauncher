"""GPU regression for the camera-centred fog sphere. Run with uv --with moderngl --with numpy."""
import importlib.util
from pathlib import Path
import moderngl
import numpy as np

spec = importlib.util.spec_from_file_location("programs", Path(__file__).with_name("programs.py"))
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)
ctx = moderngl.create_standalone_context()
print("GPU:", ctx.info["GL_RENDERER"])
vertex = """#version 330
void main() { vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1); }
"""
header = """#version 330
#define DIM_OVERWORLD 1
#define FOG_DENSITY 1.0
uniform float far;
uniform float rainStrength;
uniform vec3 upPosition;
uniform vec3 cameraPosition;
uniform ivec2 eyeBrightnessSmooth;
uniform vec3 testDirection;
uniform float testDistance;
float sat(float x) {return clamp(x,0.0,1.0);}
float twilightFactor() {return 0.0;}
vec3 skyColorAt(vec3 d) {return vec3(1.0);}
out vec4 color;
"""
body = source.FOG.split("vec3 mediumFog(")[0]
p = ctx.program(vertex_shader=vertex, fragment_shader=header+body+"\nvoid main(){color=vec4(applyFog(vec3(0.0),testDirection,testDistance),1.0);}")
v = ctx.vertex_array(p, [])
fbo = ctx.simple_framebuffer((1,1), components=4, dtype="f4")

max_output = 1.0

def fog(dist, direction=(1,0,0), altitude=80, rain=0, far=192):
    values = dict(far=far, rainStrength=rain, upPosition=(0,1,0), cameraPosition=(0,altitude,0), eyeBrightnessSmooth=(240,240), testDirection=direction, testDistance=dist)
    for name, value in values.items():
        if name in p: p[name].value=value
    fbo.use();v.render(vertices=3)
    result=float(np.frombuffer(fbo.read(components=4,dtype="f4"),dtype="f4")[0])
    assert np.isfinite(result) and 0<=result<=max_output, (values,result)
    return result

near = fog(20)
vertical = fog(160,(0,-1,0),altitude=240)
horizontal = fog(160,altitude=240)
print("Clear fog: near",near,"160m straight down",vertical,"160m horizontal",horizontal)
assert near < .05, "Clear-weather fog washes out nearby scenery"
assert vertical < .25, "Render-distance fog forms a sphere and hides terrain below a high camera"
assert horizontal > vertical, "Chunk-edge fog must follow horizontal terrain distance, not eye radius"
print("PASS clear air and no altitude-driven spherical fog wall")
assert fog(80,rain=1)>fog(80), "Rain must still produce atmospheric haze"
assert fog(190)>fog(160)>fog(80), "Haze must blend monotonically into unloaded terrain"
assert fog(80,altitude=240)<fog(80,altitude=63), "Elevated clear air should be clearer than sea-level haze"
assert fog(600,(0,-1,0),altitude=500)<.8, "Downward fog density explodes below sea level"
for altitude in [-64,0,63,180,320,500]:
    for dy in [-1,-.9,-.1,-.001,0,.001,.1,.9,1]:
        direction=(float(np.sqrt(max(1-dy*dy,0))),dy,0)
        for distance in [1,20,80,160,600]:fog(distance,direction,altitude)
print("PASS rain, altitude falloff, monotonic chunk boundary and 270 finite ray cases")
p = ctx.program(vertex_shader=vertex, fragment_shader=header.replace("#define FOG_DENSITY 1.0", "#define FOG_DENSITY 0.0")+body+"\nvoid main(){color=vec4(applyFog(vec3(0.0),testDirection,testDistance),1.0);}")
v = ctx.vertex_array(p, [])
assert fog(180,(0,-1,0),altitude=250)==0, "Fog density zero must not leave the spherical shell"
assert fog(192)==1, "Fog density zero must still conceal the horizontal chunk cutoff"
print("PASS fog-off retains only the horizontal terrain boundary")
sky_header = """#version 330
uniform vec3 testDirection;
uniform float rainStrength;
float dayFactor(){return 1.0;}
vec3 moonTint(){return vec3(1.0);}
vec3 atmScatter(vec3 d, vec3 sunL){return vec3(.15,.3,.5);}
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
out vec4 color;
"""
sky_body = source.PREPARE_FSH.split("void main()")[0]
sky = ctx.program(vertex_shader=vertex, fragment_shader=sky_header+sky_body+"\nvoid main(){color=vec4(skyRadiance(testDirection,vec3(.8,.6,0)),1.0);}")
sv = ctx.vertex_array(sky, [])
def sky_value(d):
    if "testDirection" in sky:sky["testDirection"].value=d
    if "rainStrength" in sky:sky["rainStrength"].value=0
    fbo.use();sv.render(vertices=3)
    return np.frombuffer(fbo.read(components=4,dtype="f4"),dtype="f4")[:3].copy()
horizon=sky_value((1,0,0));below=sky_value((float(np.sqrt(.75)),-.5,0))
ratio=float(below.mean()/horizon.mean())
print("Below-horizon / horizon radiance:",ratio)
assert ratio>.95, "Artificial lower-hemisphere darkening paints a grey dome below the horizon"
print("PASS lower sky keeps horizon haze instead of an artificial dark hemisphere")
for dimension in ['DIM_NETHER','DIM_END']:
    dim_header=header.replace('DIM_OVERWORLD',dimension)
    p=ctx.program(vertex_shader=vertex,fragment_shader=dim_header+body+'\nvoid main(){color=vec4(applyFog(vec3(0.0),testDirection,testDistance),1.0);}')
    v=ctx.vertex_array(p,[])
    max_output=2.0  # Nether haze includes HDR lava-sea illumination.
    assert fog(20)>0, dimension+' fog was removed'
    assert fog(192)>=.999, dimension+' terrain cutoff is exposed'
    for dy in [-1,-.1,0,.1,1]:fog(160,(float(np.sqrt(1-dy*dy)),dy,0))
print('PASS Nether and End keep their dimension-specific haze')

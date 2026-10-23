"""GPU regressions for water slopes, bounded SSR and spatial AA; uv run --with moderngl --with numpy python <this file>."""
import importlib.util
from pathlib import Path
import moderngl
import numpy as np

root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('common', root / 'common.py')
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
ctx = moderngl.create_standalone_context()
print('GPU:', ctx.info['GL_RENDERER'])
vertex = '#version 330\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}'
assert 'vec2 waterSlope(' in common.WATER, 'water normals need an analytic slope, not four complete height evaluations'
header = '''#version 330
#define WATER_DETAIL 1
#define WATER_WAVE_HEIGHT 0.4
#define WATER_SPEED 1.0
uniform float frameTimeCounter;
uniform vec3 cameraPosition;
uniform vec2 point;
out vec4 color;
'''
noise = common.COMMON[common.COMMON.index('float hash12('):common.COMMON.index('vec2 lightmapCoords(')]
frag = header + noise + common.WATER + '''
void main(){
    float e=0.001;
    vec2 reference=vec2(waterHeight(point+vec2(e,0))-waterHeight(point-vec2(e,0)),waterHeight(point+vec2(0,e))-waterHeight(point-vec2(0,e)))/(2.0*e);
    color=vec4(waterSlope(point)-reference, length(waterNormalWorld(point)), waterNormalWorld(point).y);
}'''
p = ctx.program(vertex_shader=vertex, fragment_shader=frag)
fbo = ctx.simple_framebuffer((1,1), components=4, dtype='f4')
vao = ctx.vertex_array(p, [])
for t in (0, 7.3, 120):
    p['frameTimeCounter'].value=t
    for x in (0.25,3.71,12.32,40.19):
        pt=(x,x*0.37+0.21)
        p['point'].value=pt
        if 'cameraPosition' in p: p['cameraPosition'].value=(pt[0],63,pt[1])
        fbo.use();vao.render(vertices=3)
        out=np.frombuffer(fbo.read(components=4,dtype='f4'),dtype='f4')
        assert np.isfinite(out).all(),out
        assert np.max(np.abs(out[:2]))<0.01,(pt,t,out)
        assert abs(out[2]-1)<1e-5 and out[3]>0.6,out
print('PASS: analytic slopes match central differences at 12 points; normals finite, unit length and upward')
assert 'vec4 traceWaterReflection(' in common.WATER, 'Lite needs a bounded reflection trace and opaque scene snapshot'
header2='''#version 330
#define SSR 1
#define SSR_STEPS 12
#define WATER_SPEED 1.0
#define WATER_WAVE_HEIGHT 0.4
uniform float frameTimeCounter;
uniform vec3 cameraPosition;
uniform sampler2D depthtex1;
uniform sampler2D scene;
uniform vec3 origin;
uniform vec3 ray;
uniform float near;
out vec4 color;
vec3 viewToScreen(vec3 p){return vec3(p.xy/8.0+0.5,(-p.z-1.0)/20.0);}
vec3 screenToView(vec2 p,float d){return vec3((p-0.5)*8.0,-1.0-d*20.0);}
'''
q=ctx.program(vertex_shader=vertex,fragment_shader=header2+noise+common.WATER+'\nvoid main(){color=traceWaterReflection(scene,origin,ray,0.5);}')
va=ctx.vertex_array(q,[])
dep=ctx.texture((64,64),1,np.full((64,64),0.6,dtype='f4').tobytes(),dtype='f4')
scene=ctx.texture((64,64),3,np.tile(np.array([0.2,0.6,0.9],dtype='f4'),(64,64,1)).tobytes(),dtype='f4')
dep.filter=(moderngl.NEAREST,moderngl.NEAREST);scene.filter=(moderngl.LINEAR,moderngl.LINEAR)
dep.use(0);scene.use(1);q['depthtex1'].value=0;q['scene'].value=1
if 'near' in q:q['near'].value=0.05
q['origin'].value=(0,0,-3);q['ray'].value=(0.2,0,-0.9797959)
def trace():
    fbo.use();va.render(vertices=3)
    return np.frombuffer(fbo.read(components=4,dtype='f4'),dtype='f4')
out=trace();assert out[3]>0.9 and np.max(np.abs(out[:3]-[0.2,0.6,0.9]))<1e-4,out
scene.write(np.zeros((64,64,3),dtype='f4').tobytes());out=trace();assert out[3]>0.9 and np.max(np.abs(out[:3]))<1e-6,out
dep.write(np.ones((64,64),dtype='f4').tobytes());out=trace();assert out[3]==0,out
dep.write(np.full((64,64),0.6,dtype='f4').tobytes());q['ray'].value=(0,0,1);out=trace();assert out[3]==0,out
q['ray'].value=(1,0,0);out=trace();assert out[3]==0,out
print('PASS: SSR terrain hit, valid black reflection, sky miss, eye crossing and off-screen miss')
import sys
sys.path.insert(0,str(root))
import gen
assert '#define SSR\n' in gen.SETTINGS_LITE, 'Lite balanced needs terrain reflections enabled'
assert 'gl_FragData[1] = vec4(col, 1.0);' in gen.DEFERRED_LITE, 'Lite water must sample a stable opaque snapshot, never its live render target'
assert 'waterTransmission(' in common.WATER, 'Beer-Lambert transmission must be shared and testable'

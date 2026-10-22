"""GPU regression for Lite's HDR-safe FXAA. Run with uv --with moderngl --with numpy."""
from pathlib import Path
import importlib.util
import moderngl
import numpy as np
spec=importlib.util.spec_from_file_location('shader_common',Path(__file__).with_name('common.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
assert hasattr(c,'ANTIALIASING'), 'Lite has no spatial anti-aliasing implementation'
ctx=moderngl.create_standalone_context();print('GPU:',ctx.info['GL_RENDERER'])
v='''#version 330
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}'''
f='''#version 330
#define FXAA 1
in vec2 uv;
uniform sampler2D image;
out vec4 color;
'''+c.ANTIALIASING+'\nvoid main(){color=vec4(spatialAA(image,uv,vec2(1.0/64.0)),1.0);}'
p=ctx.program(vertex_shader=v,fragment_shader=f);vao=ctx.vertex_array(p,[])
fbo=ctx.simple_framebuffer((64,64),components=3,dtype='f4')
a=np.full((64,64,3),2.3,dtype='f4')
t=ctx.texture((64,64),3,a.tobytes(),dtype='f4');t.filter=(moderngl.LINEAR,moderngl.LINEAR);t.repeat_x=False;t.repeat_y=False
t.use(0);p['image'].value=0
def render():
    fbo.use();vao.render(vertices=3)
    return np.frombuffer(fbo.read(components=3,dtype='f4'),dtype='f4').reshape(64,64,3)
b=render();assert np.max(np.abs(b-a))<1e-5,'AA changed flat colours/HDR values'
y,x=np.mgrid[:64,:64];a[:]=np.where((x>y*0.6+12)[...,None],4.0,0.1);t.write(a.tobytes());b=render()
assert np.isfinite(b).all() and b.min()>=0.1-1e-5 and b.max()<=4.0+1e-5
middle=np.count_nonzero((b[:,:,0]>0.12)&(b[:,:,0]<3.98));assert middle>30,('AA did not smooth staircase edges',middle)
assert np.max(np.abs(b[4:40,54:60]-a[4:40,54:60]))<1e-5,'AA blurred flat texture regions'
print('PASS: HDR flat colours preserved, bounded output, diagonal stair edge smoothed:',middle,'pixels')

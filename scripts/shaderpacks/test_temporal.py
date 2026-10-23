"""GPU regression for view-dependent exposure pumping.
Run: uv run --with moderngl --with numpy python scripts/shaderpacks/test_temporal.py
Uses the actual generated FINAL_ULTRA body; synthetic images have identical histograms.
"""
import importlib.util, pathlib
import moderngl
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('pimpin_programs',ROOT/'programs.py')
source=importlib.util.module_from_spec(spec);spec.loader.exec_module(source)
ctx=moderngl.create_standalone_context()
print('GPU:',ctx.info['GL_RENDERER'])
vertex='''#version 330
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}
'''
header='''#version 330
#define AUTO_EXPOSURE
uniform sampler2D colortex0;
uniform float viewWidth;
uniform float viewHeight;
uniform float frameTime;
uniform int frameCounter;
uniform vec3 cameraPosition;
uniform vec3 previousCameraPosition;
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float exposureValue(){return 1.0;}
vec3 finishColor(vec3 c,vec2 p,float e){return vec3(e);}
'''
def convert(body):
    return body.replace('varying vec2 uv;','in vec2 uv;').replace('texture2D(', 'texture(').replace('gl_FragData[0]','color').replace('gl_FragData[1]','historyOut')
final=ctx.program(vertex_shader=vertex,fragment_shader=header+'out vec4 color;\n'+convert(source.FINAL_ULTRA))
new_path='float adaptedExposure()' in source.TAA_ULTRA
composite=ctx.program(vertex_shader=vertex,fragment_shader=header+'layout(location=0) out vec4 color;\nlayout(location=1) out vec4 historyOut;\n'+convert(source.TAA_ULTRA)) if new_path else None
size=(512,512)
vaos={p:ctx.vertex_array(p,[]) for p in [final,composite] if p}
def image(center=True,background=.06,bright=.8):
    a=np.full((size[1],size[0],4),background,dtype='f4');a[:,:,3]=1
    left=224 if center else 32;a[224:288,left:left+64,:3]=bright
    return a
def run(a,previous=0.0,dt=1/60,frame=0):
    scene=ctx.texture(size,4,a.tobytes(),dtype='f4');scene.build_mipmaps();scene.use(0)
    textures=[scene];buffers=[]
    if composite:
        h=np.zeros_like(a);h[:,:,3]=previous
        history=ctx.texture(size,4,h.tobytes(),dtype='f4');history.use(1)
        colour=ctx.texture(size,4,dtype='f4');saved=ctx.texture(size,4,dtype='f4')
        fb=ctx.framebuffer([colour,saved]);fb.use();buffers.append(fb);textures += [history,colour,saved]
        for name,value in {'colortex0':0,'colortex7':1,'frameTime':dt,'frameCounter':frame,'cameraPosition':(0,0,0),'previousCameraPosition':(0,0,0)}.items():
            if name in composite:composite[name].value=value
        vaos[composite].render(vertices=3)
        colour.build_mipmaps();colour.use(0)
    output=ctx.texture(size,4,dtype='f4');fb=ctx.framebuffer([output]);fb.use();buffers.append(fb);textures.append(output)
    for name,value in {'colortex0':0,'viewWidth':size[0],'viewHeight':size[1]}.items():
        if name in final:final[name].value=value
    vaos[final].render(vertices=3)
    data=np.frombuffer(fb.read(components=4,dtype='f4'),dtype='f4').reshape(size[1],size[0],4)
    value=float(np.median(data[:,:,0]));spread=float(np.ptp(data[:,:,0]))
    for b in buffers:b.release()
    for t in textures:t.release()
    assert np.isfinite(data).all(), 'Non-finite exposure output'
    return value,spread
values=[]
for center in [True,False]:
    a=image(center);value,spread=run(a);values.append(value)
    print('Bright patch', 'at crosshair' if center else 'off-centre', 'mean scene',float(a[:,:,:3].mean()),'exposure',value,'spatial spread',spread)
    assert spread<.005, 'Exposure differs across the screen'
difference=abs(values[0]-values[1]);print('Equal-histogram exposure difference:',difference)
assert difference<.005, 'Exposure follows crosshair pixel, not scene average (view-motion flashing)'
assert composite is not None, 'Temporal exposure must be computed before the final pass'
previous=1.15
changed=np.full((size[1],size[0],4),.8,dtype='f4');changed[:,:,3]=1
value,_=run(changed,previous=previous,frame=20)
print('First 60-Hz frame after bright scene cut:',previous,'->',value)
assert .8<value<previous and previous-value<.02, 'Sudden camera turn changes exposure in one frame'
results=[]
for fps in [30,120]:
    value=previous
    for i in range(fps):value,_=run(changed,previous=value,dt=1/fps,frame=20+i)
    results.append(value);print('After one second at',fps,'FPS:',value)
assert abs(results[0]-results[1])<.002, 'Exposure response depends on FPS'
assert .8<results[0]<1.0, 'Exposure does not gradually converge'
for previous in [0.0,-1.0,20.0]:
    value,_=run(changed,previous=previous,frame=20);assert abs(value-.8)<.001, 'Invalid history must reset safely'
manual=ctx.program(vertex_shader=vertex,fragment_shader=header.replace('#define AUTO_EXPOSURE\n','')+'out vec4 color;\n'+convert(source.FINAL_ULTRA))
print('PASS GPU spatial invariance, smooth scene cuts, FPS independence, invalid-history reset and manual-exposure compile')


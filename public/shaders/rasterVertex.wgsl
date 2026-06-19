struct CameraUniforms {
    inverseProjection: mat4x4<f32>,
    inverseView: mat4x4<f32>,
    projection: mat4x4<f32>,
    view: mat4x4<f32>,
    position: vec3<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

struct VSIn {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) centerRadius: vec4<f32>,
    @location(3) albedo: vec4<f32>,
};

struct VSOut {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) worldNormal: vec3<f32>,
    @location(1) albedo: vec4<f32>,
};

@vertex
fn vertexMain(input: VSIn) -> VSOut {
    var out: VSOut;

    let worldPos = input.centerRadius.xyz + input.position * input.centerRadius.w;
    let normalMat = mat3x3<f32>(
        camera.inverseView[0].xyz,
        camera.inverseView[1].xyz,
        camera.inverseView[2].xyz
    );

    out.worldNormal = normalize(normalMat * input.normal);
    out.albedo = input.albedo;
    out.clipPosition = camera.projection * camera.view * vec4<f32>(worldPos, 1.0);

    return out;
}

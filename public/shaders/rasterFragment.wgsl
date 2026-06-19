@group(0) @binding(1) var<uniform> directionalLight: vec3<f32>;

struct FSIn {
    @location(0) worldNormal: vec3<f32>,
    @location(1) albedo: vec4<f32>,
};

@fragment
fn fragmentMain(input: FSIn) -> @location(0) vec4<f32> {
    let n = normalize(input.worldNormal);
    let l = normalize(-directionalLight);
    let diffuse = max(dot(n, l), 0.0);
    let ambient = 0.15;

    let lit = ambient + diffuse;
    return vec4<f32>(input.albedo.rgb * lit, input.albedo.a);
}

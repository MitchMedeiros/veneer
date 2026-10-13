#version 330 core

// a fragment shader
uniform sampler2D tex;
uniform vec3 lightDir;
in vec2 uv;
in vec3 normal;
out vec4 fragColor;

const float PI = 3.14159;

vec3 shade(vec3 base, vec3 n) {
    float d = max(dot(normalize(n), normalize(lightDir)), 0.0);
    return base * (0.2 + 0.8 * d);
}

void main() {
    vec4 c = texture(tex, uv);
    if (c.a < 0.5) discard;
    fragColor = vec4(shade(c.rgb, normal), 1.0);
}

// a pixel shader
cbuffer Frame : register(b0)
{
    float4x4 viewProj;
    float3 lightDir;
};

Texture2D tex : register(t0);
SamplerState samp : register(s0);

struct PSInput
{
    float4 pos : SV_POSITION;
    float2 uv : TEXCOORD0;
    float3 normal : NORMAL;
};

float4 main(PSInput i) : SV_TARGET
{
    float4 c = tex.Sample(samp, i.uv);
    float d = saturate(dot(normalize(i.normal), -lightDir));
    clip(c.a - 0.5f);
    return float4(c.rgb * (0.2 + 0.8 * d), 1.0);
}

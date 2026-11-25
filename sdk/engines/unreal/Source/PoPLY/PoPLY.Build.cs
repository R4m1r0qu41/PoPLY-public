// SPDX-License-Identifier: Apache-2.0
using UnrealBuildTool;

public class PoPLY : ModuleRules
{
    public PoPLY(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "HTTP", "Json" });
    }
}

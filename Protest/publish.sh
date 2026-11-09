dotnet restore --runtime win-x64 -p:Configuration=Release -p:SelfContained=true -p:PublishAssemblyName=protest-win-x64 -p:AppendRuntimeIdentifierToOutputPath=true --nologo
dotnet publish --configuration Release --framework net10.0 --runtime win-x64 --self-contained true -p:PublishAssemblyName=protest-win-x64 -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -p:AppendRuntimeIdentifierToOutputPath=true --output "./bin/Publish" --no-restore --nologo

dotnet restore --runtime win-arm64 -p:Configuration=Release -p:SelfContained=true -p:PublishAssemblyName=protest-win-arm64 -p:AppendRuntimeIdentifierToOutputPath=true --nologo
dotnet publish --configuration Release --framework net10.0 --runtime win-arm64 --self-contained true -p:PublishAssemblyName=protest-win-arm64 -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -p:AppendRuntimeIdentifierToOutputPath=true --output "./bin/Publish" --no-restore --nologo

dotnet restore --runtime osx-x64 -p:Configuration=Release -p:SelfContained=true -p:PublishAssemblyName=protest-osx-x64 -p:AppendRuntimeIdentifierToOutputPath=true --nologo
dotnet publish --configuration Release --framework net10.0 --runtime osx-x64 --self-contained true -p:PublishAssemblyName=protest-osx-x64 -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -p:AppendRuntimeIdentifierToOutputPath=true --output "./bin/Publish" --no-restore --nologo

dotnet restore --runtime osx-arm64 -p:Configuration=Release -p:SelfContained=true -p:PublishAssemblyName=protest-osx-arm64 -p:AppendRuntimeIdentifierToOutputPath=true --nologo
dotnet publish --configuration Release --framework net10.0 --runtime osx-arm64 --self-contained true -p:PublishAssemblyName=protest-osx-arm64 -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -p:AppendRuntimeIdentifierToOutputPath=true --output "./bin/Publish" --no-restore --nologo

dotnet restore --runtime linux-x64 -p:Configuration=Release -p:SelfContained=true -p:PublishAssemblyName=protest-linux-x64 -p:AppendRuntimeIdentifierToOutputPath=true --nologo
dotnet publish --configuration Release --framework net10.0 --runtime linux-x64 --self-contained true -p:PublishAssemblyName=protest-linux-x64 -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -p:AppendRuntimeIdentifierToOutputPath=true --output "./bin/Publish" --no-restore --nologo

dotnet restore --runtime linux-arm64 -p:Configuration=Release -p:SelfContained=true -p:PublishAssemblyName=protest-linux-arm64 -p:AppendRuntimeIdentifierToOutputPath=true --nologo
dotnet publish --configuration Release --framework net10.0 --runtime linux-arm64 --self-contained true -p:PublishAssemblyName=protest-linux-arm64 -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -p:AppendRuntimeIdentifierToOutputPath=true --output "./bin/Publish" --no-restore --nologo

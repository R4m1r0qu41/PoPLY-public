// SPDX-License-Identifier: Apache-2.0
#pragma once

#include "CoreMinimal.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"

struct FPoPLYResponse
{
    int32 StatusCode = 0;
    FString Body;
    FString Error;

    bool IsSuccess() const { return Error.IsEmpty() && StatusCode >= 200 && StatusCode < 300; }
};

DECLARE_DELEGATE_OneParam(FPoPLYResponseDelegate, const FPoPLYResponse&);

/** Server-only transport. Never compile publisher credentials into a client target. */
class FPoPLYPublisherClient
{
public:
    FPoPLYPublisherClient(FString InBaseUrl, FString InApiKey);

    bool SubmitCheckpoint(const FString& Json, FPoPLYResponseDelegate Completed) const;
    bool SubmitAchievement(const FString& Json, FPoPLYResponseDelegate Completed) const;

private:
    bool PostJson(const FString& Path, const FString& Json, FPoPLYResponseDelegate Completed) const;

    FString BaseUrl;
    FString ApiKey;
};

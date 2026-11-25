// SPDX-License-Identifier: Apache-2.0
#include "PoPLYPublisherClient.h"
#include "Dom/JsonObject.h"
#include "HttpModule.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
    // Surface the verifier's structured {error, message} body so integrators get the actionable
    // reason (e.g. a sequence conflict) instead of a generic failure string.
    FString ExtractVerifierError(const FString& Body)
    {
        const FString Fallback = TEXT("PoPLY verifier request failed");
        TSharedPtr<FJsonObject> Parsed;
        const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
        if (!FJsonSerializer::Deserialize(Reader, Parsed) || !Parsed.IsValid())
        {
            return Fallback;
        }
        FString Code, Message;
        Parsed->TryGetStringField(TEXT("error"), Code);
        Parsed->TryGetStringField(TEXT("message"), Message);
        if (!Code.IsEmpty() && !Message.IsEmpty()) return Code + TEXT(": ") + Message;
        if (!Code.IsEmpty()) return Code;
        if (!Message.IsEmpty()) return Message;
        return Fallback;
    }
}

FPoPLYPublisherClient::FPoPLYPublisherClient(FString InBaseUrl, FString InApiKey)
    : BaseUrl(MoveTemp(InBaseUrl)), ApiKey(MoveTemp(InApiKey))
{
    BaseUrl.RemoveFromEnd(TEXT("/"));
    checkf(!BaseUrl.IsEmpty(), TEXT("PoPLY base URL is required"));
    checkf(!ApiKey.IsEmpty(), TEXT("PoPLY publisher API key is required"));
}

bool FPoPLYPublisherClient::SubmitCheckpoint(
    const FString& Json,
    FPoPLYResponseDelegate Completed) const
{
    return PostJson(TEXT("/v1/checkpoints"), Json, MoveTemp(Completed));
}

bool FPoPLYPublisherClient::SubmitAchievement(
    const FString& Json,
    FPoPLYResponseDelegate Completed) const
{
    return PostJson(TEXT("/v1/achievements"), Json, MoveTemp(Completed));
}

bool FPoPLYPublisherClient::PostJson(
    const FString& Path,
    const FString& Json,
    FPoPLYResponseDelegate Completed) const
{
    if (Json.IsEmpty()) return false;
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(BaseUrl + Path);
    Request->SetVerb(TEXT("POST"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->SetHeader(TEXT("Authorization"), TEXT("Bearer ") + ApiKey);
    Request->SetContentAsString(Json);
    Request->OnProcessRequestComplete().BindLambda(
        [Callback = MoveTemp(Completed)](
            FHttpRequestPtr,
            FHttpResponsePtr Response,
            bool bConnectedSuccessfully) mutable
        {
            FPoPLYResponse Result;
            if (!bConnectedSuccessfully || !Response.IsValid())
            {
                Result.Error = TEXT("PoPLY verifier request failed");
            }
            else
            {
                Result.StatusCode = Response->GetResponseCode();
                Result.Body = Response->GetContentAsString();
                if (Result.StatusCode < 200 || Result.StatusCode >= 300)
                {
                    Result.Error = ExtractVerifierError(Result.Body);
                }
            }
            Callback.ExecuteIfBound(Result);
        });
    return Request->ProcessRequest();
}

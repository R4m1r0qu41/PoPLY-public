// SPDX-License-Identifier: Apache-2.0
using System;
using System.Collections;
using System.Text;
using UnityEngine.Networking;

namespace CipherLayer.PoPLY
{
    /// Server-only transport for the PoPLY Publisher Verifier API.
    /// Never include a publisher API key in a player build.
    public sealed class PoPLYPublisherClient
    {
        public readonly struct Response
        {
            public readonly long StatusCode;
            public readonly string Body;
            public readonly string Error;
            public bool IsSuccess => StatusCode >= 200 && StatusCode < 300 && String.IsNullOrEmpty(Error);

            public Response(long statusCode, string body, string error)
            {
                StatusCode = statusCode;
                Body = body ?? String.Empty;
                Error = error ?? String.Empty;
            }
        }

        [Serializable]
        private struct ErrorBody
        {
            public string error;
            public string message;
        }

        private readonly string baseUrl;
        private readonly string apiKey;

        public PoPLYPublisherClient(string baseUrl, string apiKey)
        {
            if (String.IsNullOrWhiteSpace(baseUrl)) throw new ArgumentException("Base URL is required.", nameof(baseUrl));
            if (String.IsNullOrWhiteSpace(apiKey)) throw new ArgumentException("Publisher API key is required.", nameof(apiKey));
            this.baseUrl = baseUrl.TrimEnd('/');
            this.apiKey = apiKey;
        }

        public IEnumerator SubmitCheckpoint(string json, Action<Response> completed)
        {
            return PostJson("/v1/checkpoints", json, completed);
        }

        public IEnumerator SubmitAchievement(string json, Action<Response> completed)
        {
            return PostJson("/v1/achievements", json, completed);
        }

        private IEnumerator PostJson(string path, string json, Action<Response> completed)
        {
            if (String.IsNullOrWhiteSpace(json)) throw new ArgumentException("JSON body is required.", nameof(json));
            byte[] body = Encoding.UTF8.GetBytes(json);
            using (var request = new UnityWebRequest(baseUrl + path, UnityWebRequest.kHttpVerbPOST))
            {
                request.uploadHandler = new UploadHandlerRaw(body);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("Authorization", "Bearer " + apiKey);
                yield return request.SendWebRequest();

                string text = request.downloadHandler.text;
                string error = request.result == UnityWebRequest.Result.ConnectionError ||
                    request.result == UnityWebRequest.Result.DataProcessingError
                    ? request.error
                    : String.Empty;
                // Surface the verifier's structured {error, message} body so callers see the
                // actionable reason (e.g. a sequence conflict) instead of a bare status code.
                if (String.IsNullOrEmpty(error) && (request.responseCode < 200 || request.responseCode >= 300))
                {
                    error = ExtractVerifierError(text);
                }
                completed?.Invoke(new Response(request.responseCode, text, error));
            }
        }

        private static string ExtractVerifierError(string body)
        {
            if (String.IsNullOrEmpty(body)) return "PoPLY verifier request failed";
            try
            {
                ErrorBody parsed = UnityEngine.JsonUtility.FromJson<ErrorBody>(body);
                if (!String.IsNullOrEmpty(parsed.error) && !String.IsNullOrEmpty(parsed.message))
                {
                    return parsed.error + ": " + parsed.message;
                }
                if (!String.IsNullOrEmpty(parsed.error)) return parsed.error;
                if (!String.IsNullOrEmpty(parsed.message)) return parsed.message;
            }
            catch (Exception)
            {
                // Non-JSON error body; fall through to the generic message.
            }
            return "PoPLY verifier request failed";
        }
    }
}

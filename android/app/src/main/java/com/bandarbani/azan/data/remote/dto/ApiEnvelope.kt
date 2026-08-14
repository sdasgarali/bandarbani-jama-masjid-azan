package com.bandarbani.azan.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * Every API response is wrapped: `{ "data": ... }` on success or `{ "error": {code,message} }`.
 * We deserialize into this envelope and unwrap `data` in the API/repository layer.
 */
@Serializable
data class ApiEnvelope<T>(
    val data: T? = null,
    val error: ApiError? = null,
)

@Serializable
data class ApiError(
    val code: String,
    val message: String,
)

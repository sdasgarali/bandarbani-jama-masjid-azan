package com.bandarbani.azan.core

/**
 * The five daily prayers. Ordinal order is significant and MUST match the published payload order
 * (FAJR..ISHA). It is used to derive deterministic alarm request codes, so do not reorder.
 */
enum class Prayer {
    FAJR,
    DHUHR,
    ASR,
    MAGHRIB,
    ISHA;

    companion object {
        /** Parse the wire value (uppercase enum name from the API payload). Null on unknown. */
        fun fromApi(value: String): Prayer? =
            entries.firstOrNull { it.name.equals(value, ignoreCase = true) }
    }
}

package com.bandarbani.azan.data.local

import androidx.room.TypeConverter
import com.bandarbani.azan.core.Prayer

/** Room type converters for enum columns. */
class Converters {
    @TypeConverter
    fun fromPrayer(value: Prayer): String = value.name

    @TypeConverter
    fun toPrayer(value: String): Prayer = Prayer.valueOf(value)
}

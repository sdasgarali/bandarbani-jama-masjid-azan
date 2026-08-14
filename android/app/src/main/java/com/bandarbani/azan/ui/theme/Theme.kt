package com.bandarbani.azan.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColors = lightColorScheme(
    primary = Green700,
    onPrimary = Color.White,
    primaryContainer = Green100,
    onPrimaryContainer = Green900,
    secondary = Gold700,
    onSecondary = Color.White,
    secondaryContainer = Gold100,
    onSecondaryContainer = Color(0xFF4A3A00),
    tertiary = Green600,
    background = Cream,
    onBackground = InkDark,
    surface = Color.White,
    onSurface = InkDark,
    surfaceVariant = Green100,
    onSurfaceVariant = Green900,
)

private val DarkColors = darkColorScheme(
    primary = Green200,
    onPrimary = Green900,
    primaryContainer = Green800,
    onPrimaryContainer = Green100,
    secondary = Gold300,
    onSecondary = Color(0xFF3A2E00),
    secondaryContainer = Gold700,
    onSecondaryContainer = Gold100,
    tertiary = Green600,
    background = SurfaceDark,
    onBackground = Cream,
    surface = Color(0xFF12211A),
    onSurface = Cream,
    surfaceVariant = Green800,
    onSurfaceVariant = Green100,
)

@Composable
fun BandarbaniAzanTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.primary.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        content = content,
    )
}

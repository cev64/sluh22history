package com.personal.leaguehistory.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.personal.leaguehistory.ui.theme.EyebrowStyle

/**
 * The site's white panel: a rounded card with a heading row. Elevation is kept
 * low because Material 3 already separates surfaces by tone, and the web
 * design's heavy drop shadow reads as dated on a device.
 */
@Composable
fun SectionCard(
    title: String,
    modifier: Modifier = Modifier,
    icon: String? = null,
    eyebrow: String? = null,
    trailing: @Composable (() -> Unit)? = null,
    contentPadding: Int = 0,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(modifier = Modifier.padding(bottom = 8.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 18.dp, end = 12.dp, top = 16.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    if (eyebrow != null) {
                        Text(
                            text = eyebrow.uppercase(),
                            style = EyebrowStyle,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    Text(
                        text = if (icon != null) "$icon  $title" else title,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                if (trailing != null) trailing()
            }

            Column(
                modifier = Modifier.padding(horizontal = contentPadding.dp),
                content = content
            )
        }
    }
}

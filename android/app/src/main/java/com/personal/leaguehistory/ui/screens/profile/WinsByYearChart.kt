package com.personal.leaguehistory.ui.screens.profile

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.personal.leaguehistory.domain.model.SeasonLine

/**
 * Regular-season wins per year, ported from the SVG chart on the team profile
 * panel of the web record book. Drawn on a Canvas rather than pulled in as a
 * charting dependency: it is one polyline, two axes and a label per point.
 */
@Composable
fun WinsByYearChart(
    seasons: List<SeasonLine>,
    lineColor: Color,
    modifier: Modifier = Modifier,
    maxWins: Int = 14
) {
    if (seasons.isEmpty()) {
        Box(modifier = modifier.height(60.dp), contentAlignment = Alignment.Center) {
            Text(
                text = "No seasons played",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        return
    }

    val textMeasurer = rememberTextMeasurer()
    val gridColor = MaterialTheme.colorScheme.outlineVariant
    val axisColor = MaterialTheme.colorScheme.outline
    val labelColor = MaterialTheme.colorScheme.onSurfaceVariant
    val valueColor = MaterialTheme.colorScheme.onSurface
    val pointFill = MaterialTheme.colorScheme.surfaceContainer

    val description = seasons.joinToString(", ") { "${it.year}: ${it.wins} wins" }

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(190.dp)
            .semantics { contentDescription = "Regular season wins by year. $description" }
    ) {
        val leftGutter = 34f
        val bottomGutter = 30f
        val topGutter = 22f

        val plotLeft = leftGutter
        val plotRight = size.width - 8f
        val plotTop = topGutter
        val plotBottom = size.height - bottomGutter

        fun xFor(index: Int): Float = if (seasons.size == 1) {
            (plotLeft + plotRight) / 2f
        } else {
            plotLeft + index * (plotRight - plotLeft) / (seasons.size - 1)
        }

        fun yFor(wins: Int): Float =
            plotBottom - (wins.toFloat() / maxWins) * (plotBottom - plotTop)

        val tickStyle = TextStyle(fontSize = 10.sp, color = labelColor, fontWeight = FontWeight.SemiBold)
        val yearStyle = TextStyle(fontSize = 10.sp, color = labelColor, fontWeight = FontWeight.Bold)
        val valueStyle = TextStyle(fontSize = 11.sp, color = valueColor, fontWeight = FontWeight.Bold)

        // Gridlines at 0, half and full scale, matching the web chart's ticks.
        listOf(0, maxWins / 2, maxWins).forEach { tick ->
            val y = yFor(tick)
            drawLine(
                color = gridColor,
                start = Offset(plotLeft, y),
                end = Offset(plotRight, y),
                strokeWidth = 1f
            )
            drawTick(textMeasurer, tick.toString(), tickStyle, plotLeft, y)
        }

        drawLine(
            color = axisColor,
            start = Offset(plotLeft, plotBottom),
            end = Offset(plotRight, plotBottom),
            strokeWidth = 1.4f
        )

        val path = Path().apply {
            seasons.forEachIndexed { index, season ->
                val point = Offset(xFor(index), yFor(season.wins))
                if (index == 0) moveTo(point.x, point.y) else lineTo(point.x, point.y)
            }
        }

        drawPath(
            path = path,
            color = lineColor,
            style = Stroke(width = 4f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        )

        seasons.forEachIndexed { index, season ->
            val x = xFor(index)
            val y = yFor(season.wins)

            drawCircle(color = pointFill, radius = 5.5f, center = Offset(x, y))
            drawCircle(
                color = lineColor,
                radius = 5.5f,
                center = Offset(x, y),
                style = Stroke(width = 3f)
            )

            drawCentredText(textMeasurer, season.wins.toString(), valueStyle, x, y - 20f)
            drawCentredText(textMeasurer, season.year.toString(), yearStyle, x, plotBottom + 8f)
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawTick(
    measurer: TextMeasurer,
    text: String,
    style: TextStyle,
    plotLeft: Float,
    y: Float
) {
    val layout = measurer.measure(text, style)
    drawText(
        textLayoutResult = layout,
        topLeft = Offset(plotLeft - layout.size.width - 6f, y - layout.size.height / 2f)
    )
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawCentredText(
    measurer: TextMeasurer,
    text: String,
    style: TextStyle,
    centerX: Float,
    top: Float
) {
    val layout = measurer.measure(text, style)
    drawText(
        textLayoutResult = layout,
        topLeft = Offset(centerX - layout.size.width / 2f, top)
    )
}

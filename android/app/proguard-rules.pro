# The league data is deserialized by name, so the DTOs and their generated
# serializers must survive shrinking even though nothing references them
# reflectively in source.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**

-keepclassmembers class com.personal.leaguehistory.data.local.** {
    *** Companion;
}
-keepclasseswithmembers class com.personal.leaguehistory.data.local.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.personal.leaguehistory.data.local.**$$serializer { *; }

# Glance widget receivers are instantiated by the framework from the manifest.
-keep class com.personal.leaguehistory.widgets.*Receiver { *; }

# Kotlin metadata used by Compose and coroutines internals.
-keepclassmembers class kotlin.Metadata { public <methods>; }

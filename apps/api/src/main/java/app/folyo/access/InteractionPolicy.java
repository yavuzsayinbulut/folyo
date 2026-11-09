package app.folyo.access;

/**
 * Defter yazisi ve ozel mesaj icin kim yazabilir. Her durumda yazan kisi admin politikasina gore dogrulanmis olmalidir.
 * APPROVAL: defter yazisi onaydan sonra gorunur; ozel mesaj "istekler" klasorune duser.
 */
public enum InteractionPolicy {
    VERIFIED,
    APPROVAL,
    NOBODY
}
